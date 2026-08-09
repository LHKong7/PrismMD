/**
 * piLLMProvider 的契约测试。
 *
 * 这些断言锁的是**上层依赖的形状**，不是 pi 的行为：agentInstance 的流式
 * 消费逻辑、contextCore 的摘要、toolsCore 的子 agent 都按原
 * `providers/openai.ts` 的产出形状写的。适配器换掉底层实现时，这个形状
 * 必须逐字保持一致 —— 所以先把它钉住。
 *
 * 全程走 pi 自带的 faux provider，不发网络请求。
 */

import { describe, expect, it } from 'vitest'
import { createModels, type Context } from '@earendil-works/pi-ai'
import {
    fauxAssistantMessage,
    fauxProvider,
    fauxToolCall,
} from '@earendil-works/pi-ai/providers/faux'
import type { LLMResponse } from '../llmProtocol'
import { PiLLMProvider } from './piLLMProvider'

/**
 * 造一个接在 faux provider 上的 PiLLMProvider。
 *
 * PiLLMProvider 在构造函数里自己解析真实 provider，测试要绕过这一步 ——
 * 直接替换私有的 `_models` / `_model`，这样被测的就是**转换逻辑**本身
 * （消息映射、流式契约、usage 归一化），而不是 provider 目录。
 */
function fauxBackedProvider(responses: Parameters<ReturnType<typeof fauxProvider>['setResponses']>[0]) {
    const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-1', contextWindow: 111_111 }] })
    const models = createModels()
    models.setProvider(faux.provider)
    faux.setResponses(responses)

    const provider = Object.create(PiLLMProvider.prototype) as PiLLMProvider
    // 记录最后一次收到的 Context，供消息转换断言使用。
    let lastContext: Context | undefined
    const spied = {
        streamSimple: (model: any, context: Context, options?: any) => {
            lastContext = context
            return models.streamSimple(model, context, options)
        },
    }
    Object.assign(provider, { _models: spied, _model: faux.getModel() })
    return { provider, getContext: () => lastContext }
}

async function drain(gen: AsyncGenerator<LLMResponse>): Promise<LLMResponse[]> {
    const out: LLMResponse[] = []
    for await (const r of gen) out.push(r)
    return out
}

describe('PiLLMProvider — 非流式', () => {
    it('返回内容、模型和归一化后的 usage', async () => {
        const { provider } = fauxBackedProvider([fauxAssistantMessage('hello world')])
        const res = (await provider.chat([{ role: 'user', content: 'hi' }])) as LLMResponse

        expect(res.content).toBe('hello world')
        expect(res.toolCalls).toEqual([])
        // 上层的 toTokenUsage 认 snake_case，不是 pi 的 camelCase。
        expect(res.usage).toHaveProperty('input_tokens')
        expect(res.usage).toHaveProperty('output_tokens')
    })

    it('把 toolCall 摊平成 { id, name, arguments }', async () => {
        const { provider } = fauxBackedProvider([
            fauxAssistantMessage(fauxToolCall('read_file', { path: '/a.md' }, { id: 'call_1' }), {
                stopReason: 'toolUse',
            }),
        ])
        const res = (await provider.chat([{ role: 'user', content: 'read it' }])) as LLMResponse

        expect(res.toolCalls).toEqual([
            { id: 'call_1', name: 'read_file', arguments: { path: '/a.md' } },
        ])
    })

    it('空内容归一成 null，不是空串', async () => {
        const { provider } = fauxBackedProvider([
            fauxAssistantMessage(fauxToolCall('noop', {}), { stopReason: 'toolUse' }),
        ])
        const res = (await provider.chat([{ role: 'user', content: 'x' }])) as LLMResponse
        expect(res.content).toBeNull()
    })
})

describe('PiLLMProvider — 流式契约', () => {
    it('先逐段 yield 增量，最后补一次完整内容 + usage', async () => {
        const { provider } = fauxBackedProvider([fauxAssistantMessage('alpha beta gamma')])
        const chunks = await drain(
            provider.chat([{ role: 'user', content: 'go' }], { stream: true }) as AsyncGenerator<LLMResponse>,
        )

        expect(chunks.length).toBeGreaterThan(1)

        // 中间块：只有增量文本，没有 toolCalls / usage。
        const deltas = chunks.slice(0, -1)
        expect(deltas.every((c) => c.toolCalls.length === 0)).toBe(true)
        expect(deltas.every((c) => Object.keys(c.usage).length === 0)).toBe(true)
        // 增量拼起来 = 完整文本（而不是每块都是累计值）。
        expect(deltas.map((c) => c.content ?? '').join('')).toBe('alpha beta gamma')

        // 末块：完整内容 + usage，这是 agentInstance 落库和计费的依据。
        const last = chunks[chunks.length - 1]
        expect(last.content).toBe('alpha beta gamma')
        expect(last.usage).toHaveProperty('input_tokens')
    })

    it('流式下的 toolCall 只出现在末块', async () => {
        const { provider } = fauxBackedProvider([
            fauxAssistantMessage(
                [{ type: 'text', text: 'let me check' }, fauxToolCall('grep', { q: 'x' }, { id: 'c1' })],
                { stopReason: 'toolUse' },
            ),
        ])
        const chunks = await drain(
            provider.chat([{ role: 'user', content: 'go' }], { stream: true }) as AsyncGenerator<LLMResponse>,
        )

        expect(chunks.slice(0, -1).every((c) => c.toolCalls.length === 0)).toBe(true)
        expect(chunks[chunks.length - 1].toolCalls).toEqual([
            { id: 'c1', name: 'grep', arguments: { q: 'x' } },
        ])
    })
})

describe('PiLLMProvider — 消息转换', () => {
    it('system 消息抽成 Context.systemPrompt，不留在 messages 里', async () => {
        const { provider, getContext } = fauxBackedProvider([fauxAssistantMessage('ok')])
        await provider.chat([
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'hi' },
        ])

        const ctx = getContext()!
        expect(ctx.systemPrompt).toBe('You are helpful.')
        expect(ctx.messages.map((m) => m.role)).toEqual(['user'])
    })

    it('assistant+tool 往返还原成 toolCall / toolResult，且回填 toolName', async () => {
        const { provider, getContext } = fauxBackedProvider([fauxAssistantMessage('done')])
        await provider.chat([
            { role: 'user', content: 'read it' },
            {
                role: 'assistant',
                content: '',
                tool_calls: [
                    { id: 'call_9', function: { name: 'read_file', arguments: '{"path":"/a.md"}' } },
                ],
            },
            { role: 'tool', tool_call_id: 'call_9', content: '# A' },
        ])

        const ctx = getContext()!
        expect(ctx.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'toolResult'])

        const assistant = ctx.messages[1] as any
        expect(assistant.content[0]).toMatchObject({
            type: 'toolCall',
            id: 'call_9',
            name: 'read_file',
            arguments: { path: '/a.md' },
        })

        // OpenAI 的 tool 消息不带工具名，必须从对应的 tool_call 回填。
        const result = ctx.messages[2] as any
        expect(result.toolName).toBe('read_file')
        expect(result.toolCallId).toBe('call_9')
    })

    it('OpenAI 的工具定义透传成 pi 的 Tool', async () => {
        const { provider, getContext } = fauxBackedProvider([fauxAssistantMessage('ok')])
        await provider.chat([{ role: 'user', content: 'hi' }], {
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'grep',
                        description: 'search',
                        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
                    },
                },
            ],
        })

        expect(getContext()!.tools).toEqual([
            {
                name: 'grep',
                description: 'search',
                parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
            },
        ])
    })
})

describe('PiLLMProvider — 上下文窗口', () => {
    it('从模型元数据读，不再按模型名查硬编码表', () => {
        const { provider } = fauxBackedProvider([fauxAssistantMessage('ok')])
        expect(provider.contextWindowSize).toBe(111_111)
    })
})

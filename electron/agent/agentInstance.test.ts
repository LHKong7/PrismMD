/**
 * AgentInstance 的集成测试。
 *
 * 走完整链路：AgentBuilder → AgentInstance → pi 的 Agent → HTTP → 工具循环。
 * 端点是本地起的假 OpenAI 兼容服务（127.0.0.1，端口由系统分配），按脚本
 * 逐个返回预设响应，所以工具循环、流式、轮次上限都能真实跑一遍。
 *
 * 这些断言对应 `agentWorker.ts` 依赖的行为 —— 它是 `electron/agent/` 唯一的
 * 消费者，它和主进程之间的消息协议不能因为换了循环实现而改变。
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgentBuilder } from './index'
import type { StreamChunk, ToolDefinition } from './types'

/** 一次预设的响应：纯文本，或一次工具调用。 */
type Scripted =
    | { text: string }
    | { toolCall: { id: string; name: string; args: Record<string, unknown> } }

let server: http.Server
let baseUrl: string
let script: Scripted[] = []
let requests: any[] = []
let lastPath = ''
let lastAuth = ''

function writeSse(res: http.ServerResponse, step: Scripted) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    const base = { id: 'c1', object: 'chat.completion.chunk', model: 'm' }

    if ('text' in step) {
        // 切成两段，确保流式增量真的分块到达。
        const half = Math.ceil(step.text.length / 2)
        send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: step.text.slice(0, half) } }] })
        send({ ...base, choices: [{ index: 0, delta: { content: step.text.slice(half) } }] })
        send({
            ...base,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
        })
    } else {
        const { id, name, args } = step.toolCall
        send({
            ...base,
            choices: [{
                index: 0,
                delta: {
                    role: 'assistant',
                    tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
                },
            }],
        })
        send({
            ...base,
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
            usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
        })
    }
    res.write('data: [DONE]\n\n')
    res.end()
}

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
            lastPath = req.url ?? ''
            lastAuth = req.headers['authorization'] ?? ''
            requests.push(JSON.parse(body || '{}'))
            // 脚本用尽后一律回一句收尾文本，避免测试因为多跑一轮而挂死。
            writeSse(res, script.shift() ?? { text: 'done' })
        })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
})

beforeEach(() => {
    script = []
    requests = []
    lastPath = ''
    lastAuth = ''
})

function buildAgent(tools: ToolDefinition[] = [], maxToolRounds = 8) {
    return new AgentBuilder()
        .setProvider('custom', { apiKey: 'sk-t', model: 'm', baseUrl })
        .setSystemPrompt('You are terse.')
        .enableContext(false) // 关掉 ContextBuilder，让断言只针对循环本身
        .setMaxToolRounds(maxToolRounds)
        .addTools(tools)
        .build()
}

async function collect(gen: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
    const out: StreamChunk[] = []
    for await (const c of gen) out.push(c)
    return out
}

describe('AgentInstance — 基本对话', () => {
    it('chat() 返回回复和 usage', async () => {
        script = [{ text: 'hello world' }]
        const result = await buildAgent().chat('hi')

        expect(result.reply).toBe('hello world')
        expect(result.hadToolCalls).toBe(false)
        expect(result.usage?.inputTokens).toBe(7)
        expect(result.usage?.outputTokens).toBe(3)
    })

    it('system prompt 进了请求体', async () => {
        script = [{ text: 'ok' }]
        await buildAgent().chat('hi')
        expect(JSON.stringify(requests[0].messages)).toContain('You are terse.')
    })

    it('历史被带上，顺序正确', async () => {
        script = [{ text: 'ok' }]
        await buildAgent().chat('third', [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'second' },
        ])

        const roles = requests[0].messages.map((m: any) => m.role)
        const texts = JSON.stringify(requests[0].messages)
        expect(texts).toContain('first')
        expect(texts).toContain('second')
        expect(texts).toContain('third')
        // system 在最前，用户最后一句在最后。
        expect(roles[0]).toBe('system')
        expect(roles[roles.length - 1]).toBe('user')
    })
})

describe('AgentInstance — 流式', () => {
    it('先出增量块，最后一块 done=true 带完整 reply', async () => {
        script = [{ text: 'alpha beta' }]
        const chunks = await collect(buildAgent().stream('go'))

        const deltas = chunks.filter((c) => !c.done)
        expect(deltas.length).toBeGreaterThanOrEqual(2)
        expect(deltas.map((c) => c.delta).join('')).toBe('alpha beta')

        const last = chunks[chunks.length - 1]
        expect(last.done).toBe(true)
        expect(last.reply).toBe('alpha beta')
        expect(last.usage?.inputTokens).toBe(7)
    })
})

describe('AgentInstance — 工具循环', () => {
    it('执行工具并把观察回灌，然后给出最终回复', async () => {
        const calls: Record<string, unknown>[] = []
        const echo: ToolDefinition = {
            name: 'echo',
            description: 'echo',
            parameters: { text: { type: 'string' } },
            required: ['text'],
            execute: async (args) => { calls.push(args); return `echoed:${args.text}` },
        }

        script = [
            { toolCall: { id: 'call_1', name: 'echo', args: { text: 'ping' } } },
            { text: 'all done' },
        ]
        const result = await buildAgent([echo]).chat('use the tool')

        expect(calls).toEqual([{ text: 'ping' }])
        expect(result.hadToolCalls).toBe(true)
        expect(result.reply).toBe('all done')

        // 第二次请求里必须带上工具结果，否则模型看不到观察。
        expect(JSON.stringify(requests[1])).toContain('echoed:ping')
    })

    it('工具抛异常不中断循环，错误当观察回给模型', async () => {
        const boom: ToolDefinition = {
            name: 'boom',
            description: 'always throws',
            parameters: {},
            execute: async () => { throw new Error('kaboom') },
        }

        script = [
            { toolCall: { id: 'call_1', name: 'boom', args: {} } },
            { text: 'recovered' },
        ]
        const result = await buildAgent([boom]).chat('go')

        expect(result.reply).toBe('recovered')
        expect(JSON.stringify(requests[1])).toContain('kaboom')
    })

    it('maxToolRounds 到顶后停止，不会无限循环', async () => {
        const noop: ToolDefinition = {
            name: 'noop',
            description: 'noop',
            parameters: {},
            execute: async () => 'ok',
        }
        // 脚本一直回工具调用；只有轮次上限能让它停下来。
        script = Array.from({ length: 20 }, (_, i) => ({
            toolCall: { id: `call_${i}`, name: 'noop', args: {} },
        }))

        await buildAgent([noop], 3).chat('loop forever')

        // 3 轮上限 → 请求数远小于脚本长度。
        expect(requests.length).toBeLessThanOrEqual(4)
    })

    it('ask_user 在没有 humanInputCallback 时给出可用的降级观察', async () => {
        script = [
            { toolCall: { id: 'call_1', name: 'ask_user', args: { question: 'which one?' } } },
            { text: 'proceeded' },
        ]
        const result = await buildAgent().chat('go')

        expect(result.reply).toBe('proceeded')
        expect(JSON.stringify(requests[1])).toContain('Human input not available')
    })
})

describe('AgentInstance — 端点形态', () => {
    it('custom：打到 /chat/completions，带上设置里的 key', async () => {
        script = [{ text: 'ok' }]
        await buildAgent().chat('hi')
        expect(lastPath).toBe('/v1/chat/completions')
        expect(lastAuth).toBe('Bearer sk-t')
        expect(requests[0].model).toBe('m')
    })

    it('ollama：自动补 /v1，本地端点无需 key', async () => {
        script = [{ text: 'ok' }]
        const host = baseUrl.replace(/\/v1$/, '')
        const agent = new AgentBuilder()
            .setProvider('ollama', { apiKey: '', model: 'llama3.1:8b', baseUrl: host })
            .setSystemPrompt('x')
            .enableContext(false)
            .build()

        const result = await agent.chat('hi')
        expect(lastPath).toBe('/v1/chat/completions')
        expect(requests[0].model).toBe('llama3.1:8b')
        expect(result.reply).toBe('ok')
    })
})

describe('AgentInstance — 错误与中断', () => {
    it('LLM 报错时返回面向用户的错误文案，而不是抛出', async () => {
        const agent = new AgentBuilder()
            .setProvider('custom', { apiKey: 'sk-t', model: 'm', baseUrl: 'http://127.0.0.1:1/v1' })
            .setSystemPrompt('x')
            .enableContext(false)
            .build()

        const result = await agent.chat('hi')
        expect(result.reply).toContain('error communicating with the AI model')
        expect(agent.getMetrics().errorCount).toBeGreaterThan(0)
    })
})

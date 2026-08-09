/**
 * Prompt cache 稳定性测试。
 *
 * pi-ai 默认就给 system prompt / tools / 最后一条 user message 打
 * `cache_control: {type:'ephemeral'}` 断点（见 pi-ai 的
 * `api/anthropic-messages.js:getCacheControl`），所以 provider 端的
 * prompt 缓存**不需要我们做任何事**就在工作。
 *
 * 但它命中的前提是**请求前缀逐字节稳定**。这里的风险很具体：
 * `agentInstance.historyToPiMessages()` 给每条历史消息都塞了
 * `timestamp: Date.now()`，`ContextBuilder` 又每轮重新组装 system prompt。
 * 只要其中任何一样漏进请求体，缓存就永远不命中 —— 而且**没有任何报错**，
 * 只有账单和首 token 延迟会变差。
 *
 * 所以这组测试钉的是「相同输入 → 逐字节相同的请求前缀」。
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { AgentBuilder } from './index'
import type { ToolDefinition } from './types'

let server: http.Server
let baseUrl: string
let bodies: any[] = []

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let raw = ''
        req.on('data', (c) => (raw += c))
        req.on('end', () => {
            bodies.push(JSON.parse(raw || '{}'))
            const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
            const base = { id: 'c', object: 'chat.completion.chunk', model: 'm' }
            res.writeHead(200, { 'Content-Type': 'text/event-stream' })
            send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' } }] })
            send({
                ...base,
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            })
            res.write('data: [DONE]\n\n')
            res.end()
        })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
})

beforeEach(() => {
    bodies = []
})

function agent(tools: ToolDefinition[] = [], systemPrompt = 'STABLE SYSTEM PROMPT') {
    return new AgentBuilder()
        .setProvider('custom', { apiKey: 'k', model: 'm', baseUrl })
        .setSystemPrompt(systemPrompt)
        .enableContext(false)
        .addTools(tools)
        .build()
}

const HISTORY = [
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
]

describe('prompt cache — 请求前缀稳定性', () => {
    it('历史消息里的 timestamp 不进请求体', async () => {
        await agent().chat('hi', HISTORY)

        const serialized = JSON.stringify(bodies[0])
        expect(serialized).not.toContain('timestamp')
        // Date.now() 当前值的前 8 位（毫秒时间戳前缀），确保没有以任何形式漏出。
        expect(serialized).not.toContain(String(Date.now()).slice(0, 8))
    })

    it('相同输入两次调用 → 请求体逐字节相同', async () => {
        await agent().chat('same question', HISTORY)
        // 隔开一点时间，让任何依赖 Date.now() 的东西有机会暴露。
        await new Promise((r) => setTimeout(r, 25))
        await agent().chat('same question', HISTORY)

        expect(bodies).toHaveLength(2)
        expect(JSON.stringify(bodies[0])).toBe(JSON.stringify(bodies[1]))
    })

    it('system prompt 在多轮之间保持不变（缓存前缀的第一段）', async () => {
        const a = agent()
        await a.chat('q1', HISTORY)
        await a.chat('q2', [...HISTORY, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'ok' }])

        const sys = (b: any) => b.messages.find((m: any) => m.role === 'system')
        expect(sys(bodies[0])).toEqual(sys(bodies[1]))
    })

    it('工具定义在多轮之间保持不变（缓存前缀的第二段）', async () => {
        const probe: ToolDefinition = {
            name: 'probe',
            description: 'a stable tool',
            parameters: { q: { type: 'string', description: 'query' } },
            required: ['q'],
            execute: async () => 'ok',
        }
        const a = agent([probe])
        await a.chat('q1', HISTORY)
        await a.chat('q2', HISTORY)

        expect(JSON.stringify(bodies[0].tools)).toBe(JSON.stringify(bodies[1].tools))
        // 工具顺序也必须稳定 —— 顺序变了同样打断前缀。
        expect(bodies[0].tools.map((t: any) => t.function.name))
            .toEqual(['probe', 'ask_user'])
    })

    it('新一轮只在尾部追加，前缀原样保留', async () => {
        await agent().chat('q1', HISTORY)
        await agent().chat('q2', [...HISTORY, { role: 'user', content: 'q1' }, { role: 'assistant', content: 'ok' }])

        const first = bodies[0].messages
        const second = bodies[1].messages
        // 第二次请求的前 N 条必须和第一次逐字节一致，否则缓存从断点处失效。
        expect(second.slice(0, first.length)).toEqual(first)
        expect(second.length).toBeGreaterThan(first.length)
    })
})

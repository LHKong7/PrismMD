/**
 * 线路测试：起一个假的 OpenAI 兼容端点，让 PiLLMProvider 真的发一次 HTTP
 * 请求过去。
 *
 * `piLLMProvider.test.ts` 用 faux provider 测的是**转换逻辑**（消息映射、
 * 流式契约）。这里测的是它上面那一层：URL 拼对没有、Authorization 有没有
 * 带上设置里的 key、SSE 增量能不能正确拼回来。ollama / custom 两条路径全靠
 * 这一层，而它们恰恰是最容易在换 provider 实现时悄悄坏掉的。
 *
 * 只监听 127.0.0.1，端口由系统分配（0），不依赖外部服务。
 */

import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { LLMResponse } from '../llmProtocol'
import { PiLLMProvider } from './piLLMProvider'

interface Captured {
    url?: string
    auth?: string
    body?: any
}

let server: http.Server
let baseUrl: string
let captured: Captured = {}

/** 一段最小的 OpenAI 兼容 SSE 响应：两个文本增量 + usage + [DONE]。 */
function writeSse(res: http.ServerResponse) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
    const base = { id: 'c1', object: 'chat.completion.chunk', model: 'my-model' }
    send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' } }] })
    send({ ...base, choices: [{ index: 0, delta: { content: ' there' } }] })
    send({
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13 },
    })
    res.write('data: [DONE]\n\n')
    res.end()
}

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
            captured = {
                url: req.url,
                auth: req.headers['authorization'],
                body: JSON.parse(body || '{}'),
            }
            writeSse(res)
        })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
})

function customProvider() {
    return new PiLLMProvider({
        provider: 'custom',
        model: 'my-model',
        apiKey: 'sk-test-123',
        baseUrl,
    })
}

describe('PiLLMProvider — 真实 HTTP 往返（custom 端点）', () => {
    it('打到 /chat/completions，带上设置里的 key 和用户填的模型名', async () => {
        const res = (await customProvider().chat(
            [
                { role: 'system', content: 'You are terse.' },
                { role: 'user', content: 'hi' },
            ],
            { maxTokens: 64 },
        )) as LLMResponse

        expect(captured.url).toBe('/v1/chat/completions')
        expect(captured.auth).toBe('Bearer sk-test-123')
        expect(captured.body.model).toBe('my-model')
        // system 消息必须真的进请求体 —— pi 把它放在 Context 顶层，
        // 由 provider 负责摊回 messages，这一步坏了不会有类型错误。
        expect(JSON.stringify(captured.body.messages)).toContain('You are terse.')

        expect(res.content).toBe('Hello there')
        expect(res.usage.input_tokens).toBe(11)
        expect(res.usage.output_tokens).toBe(2)
    })

    it('流式：增量分段到达，末块带完整文本和 usage', async () => {
        const chunks: LLMResponse[] = []
        const gen = customProvider().chat([{ role: 'user', content: 'hi' }], {
            stream: true,
        }) as AsyncGenerator<LLMResponse>
        for await (const c of gen) chunks.push(c)

        const deltas = chunks.slice(0, -1).map((c) => c.content ?? '')
        expect(deltas.length).toBeGreaterThanOrEqual(2)
        expect(deltas.join('')).toBe('Hello there')

        const last = chunks[chunks.length - 1]
        expect(last.content).toBe('Hello there')
        expect(last.usage.input_tokens).toBe(11)
    })

    it('ollama 路径：自动补 /v1，本地端点无需 key', async () => {
        const host = baseUrl.replace(/\/v1$/, '')
        const res = (await new PiLLMProvider({
            provider: 'ollama',
            model: 'llama3.1:8b',
            apiKey: '',
            baseUrl: host,
        }).chat([{ role: 'user', content: 'hi' }])) as LLMResponse

        expect(captured.url).toBe('/v1/chat/completions')
        expect(captured.body.model).toBe('llama3.1:8b')
        expect(res.content).toBe('Hello there')
    })
})

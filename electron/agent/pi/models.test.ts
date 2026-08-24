/**
 * resolveModel 的测试 —— 覆盖 PrismMD 设置里五种 provider 到 pi 模型的解析。
 *
 * 重点在两条容易回归的路径：
 *  - ollama / custom 这两个「任意 OpenAI 兼容端点」的 baseUrl 拼接
 *  - 用户填了目录里没有的模型名时的兜底（不能抛错，请求得照发）
 */

import { describe, expect, it } from 'vitest'
import { resolveModel } from './models'

describe('resolveModel — 内置 provider', () => {
    it('openai 解析出官方目录里的模型', () => {
        const { model } = resolveModel({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-x' })
        expect(model.provider).toBe('openai')
        expect(model.id).toBe('gpt-4o')
        expect(model.contextWindow).toBeGreaterThan(0)
    })

    it('anthropic / google 各自落在自己的 provider 上', () => {
        const a = resolveModel({ provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'sk-a' })
        expect(a.model.provider).toBe('anthropic')

        const g = resolveModel({ provider: 'google', model: 'gemini-2.0-flash', apiKey: 'sk-g' })
        expect(g.model.provider).toBe('google')
    })

    it('目录里没有的模型名不抛错，借同 provider 的条目当模板', () => {
        const { model } = resolveModel({
            provider: 'openai',
            model: 'gpt-6-turbo-preview-that-does-not-exist',
            apiKey: 'sk-x',
        })
        expect(model.id).toBe('gpt-6-turbo-preview-that-does-not-exist')
        expect(model.provider).toBe('openai')
        // 元数据是估的，但必须是可用的值 —— 上下文预算逻辑要拿它算。
        expect(model.contextWindow).toBeGreaterThan(0)
    })

    it('自定义 baseUrl 会覆盖官方端点（走代理/网关的场景）', () => {
        const { model } = resolveModel({
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: 'sk-x',
            baseUrl: 'https://my-gateway.example.com/v1/',
        })
        // 尾部斜杠要吃掉，否则拼出 //chat/completions。
        expect(model.baseUrl).toBe('https://my-gateway.example.com/v1')
    })
})

describe('resolveModel — OpenAI 兼容端点', () => {
    it('ollama 不填 baseUrl 时落在本地 11434，并补 /v1', () => {
        const { model } = resolveModel({ provider: 'ollama', model: 'llama3.1:8b', apiKey: '' })
        expect(model.provider).toBe('ollama')
        expect(model.id).toBe('llama3.1:8b')
        expect(model.baseUrl).toBe('http://localhost:11434/v1')
    })

    it('ollama 自定义主机同样补 /v1，且不产生双斜杠', () => {
        const { model } = resolveModel({
            provider: 'ollama',
            model: 'qwen2',
            apiKey: '',
            baseUrl: 'http://192.168.1.9:11434/',
        })
        expect(model.baseUrl).toBe('http://192.168.1.9:11434/v1')
    })

    it('custom 原样用用户给的 baseUrl，不擅自补 /v1', () => {
        const { model } = resolveModel({
            provider: 'custom',
            model: 'my-model',
            apiKey: 'sk-c',
            baseUrl: 'https://vllm.internal/v1',
        })
        expect(model.provider).toBe('custom')
        expect(model.baseUrl).toBe('https://vllm.internal/v1')
    })

    it('custom 缺 baseUrl 直接报错 —— 没有合理默认值可猜', () => {
        expect(() => resolveModel({ provider: 'custom', model: 'm', apiKey: 'k' })).toThrow(/base URL/i)
    })
})

describe('resolveModel — 凭据', () => {
    it('设置里的 key 通过 CredentialStore 送达（而不是环境变量）', async () => {
        const { models } = resolveModel({ provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: 'sk-ant-test' })
        const auth = await models.getAuth('anthropic')
        expect(auth?.auth.apiKey).toBe('sk-ant-test')
    })

    it('key 为空时 provider 被判为未配置', async () => {
        const { models } = resolveModel({ provider: 'anthropic', model: 'claude-sonnet-4-20250514', apiKey: '' })
        // 没有 key、也没有 ANTHROPIC_API_KEY 环境变量时应解析不出凭据。
        if (!process.env.ANTHROPIC_API_KEY) {
            expect(await models.getAuth('anthropic')).toBeUndefined()
        }
    })
})

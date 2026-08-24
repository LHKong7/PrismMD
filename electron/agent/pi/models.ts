/**
 * pi/models.ts — PrismMD 的 provider 配置 → pi-ai 的 `Models` 集合。
 *
 * 取代原来手写的 `providers/{openai,anthropic,google,base}.ts`：那四个文件
 * 各自实现一遍 HTTP 调用、流式解析、重试和 usage 归一化，pi-ai 已经把这些
 * 做完了，而且顺带给了几十个 provider 的模型目录。
 *
 * 两点和上游默认行为不同，都是 PrismMD 的现实约束：
 *
 * 1. **Key 来自设置，不来自环境变量。** pi 内置的 provider 工厂用
 *    `envApiKeyAuth(...)` 读 `OPENAI_API_KEY` 之类的环境变量。但它的 resolve
 *    是 `credential.key ?? env(...)` —— 所以只要给 `createModels()` 传一个
 *    读设置的 `CredentialStore`，内置 provider 原封不动就能用上设置里的 key，
 *    不需要重建 provider。
 *
 * 2. **ollama / custom 是「任意 OpenAI 兼容端点」。** 上游没有 ollama provider，
 *    走 `createProvider()` 自建 —— 这是 pi 官方文档给的用法。模型 id 由用户在
 *    设置里手填，所以模型条目是按需现造的，而不是静态目录。
 */

import {
    createModels,
    createProvider,
    type Api,
    type Credential,
    type CredentialInfo,
    type CredentialStore,
    type Model,
    type MutableModels,
    type Provider,
} from '@earendil-works/pi-ai'
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import { googleProvider } from '@earendil-works/pi-ai/providers/google'
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'

/**
 * PrismMD 认识的 provider。前三个直连官方端点，后两个是任意 OpenAI 兼容端点
 * （ollama 是本地推理，custom 是 vLLM / LM Studio / 自建网关）。
 */
export type ProviderName = 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'

/** 设置里配好的一套连接参数。 */
export interface PiModelConfig {
    provider: ProviderName
    model: string
    apiKey: string
    /** OpenAI 兼容端点的 base URL。ollama 不填时默认本地 11434。 */
    baseUrl?: string
}

const DEFAULT_OLLAMA_BASE = 'http://localhost:11434'

/** 未知模型的保守上下文窗口：宁可少估让预算逻辑提前裁剪，也好过被端点拒绝。 */
const FALLBACK_CONTEXT_WINDOW = 32_768

/**
 * 只读的凭据存储：把设置里的单个 key 喂给 pi。
 *
 * PrismMD 一次只激活一个 provider，且 key 由调用方传进来，所以这里不需要
 * 真正的多 provider 存储 —— `read()` 对任何 providerId 都返回同一个 key，
 * 写入路径全部是 no-op（登录流程由 PrismMD 的设置界面负责，不走 pi）。
 */
function settingsCredentials(apiKey: string): CredentialStore {
    const credential: Credential | undefined = apiKey
        ? { type: 'api_key', key: apiKey }
        : undefined
    return {
        read: async () => credential,
        list: async (): Promise<readonly CredentialInfo[]> => [],
        modify: async () => credential,
        delete: async () => {},
    }
}

/**
 * 为「任意 OpenAI 兼容端点」造一个单模型 provider。
 *
 * 模型 id 是用户手填的，上游没有对应目录条目，所以现造一条。
 */
function compatibleProvider(
    id: 'ollama' | 'custom',
    displayName: string,
    modelId: string,
    baseUrl: string,
): Provider<'openai-completions'> {
    const model: Model<'openai-completions'> = {
        id: modelId,
        name: modelId,
        api: 'openai-completions',
        provider: id,
        baseUrl,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: FALLBACK_CONTEXT_WINDOW,
        maxTokens: 8_192,
    }
    return createProvider<'openai-completions'>({
        id,
        name: displayName,
        baseUrl,
        // 本地推理通常不校验 key。pi 要求 auth 能 resolve 成功，否则整个
        // provider 被判为「未配置」—— 所以 key 为空时给个占位串。
        auth: {
            apiKey: {
                name: displayName,
                resolve: async ({ credential }) => ({
                    auth: { apiKey: credential?.key || 'local' },
                    source: 'PrismMD settings',
                }),
            },
        },
        models: [model],
        api: { 'openai-completions': openAICompletionsApi() },
    })
}

/** 供设置界面展示的一条模型条目。 */
export interface ModelChoice {
    id: string
    name: string
    /** 上下文窗口（token）。 */
    contextWindow: number
    /** 每百万 input token 的美元价；0 表示免费或未知。 */
    inputCostPerMTok: number
    /** 是否支持推理/思考模式。 */
    reasoning: boolean
}

/**
 * 列出某个 provider 的可选模型 —— 取自 pi-ai 自带的目录，不需要 API key。
 *
 * 取代渲染层里手写的 `DEFAULT_MODELS` 常量表（那张表要人工跟着模型发布更新，
 * 且没有上下文窗口和价格信息）。
 *
 * ollama / custom 返回空数组：它们是「任意 OpenAI 兼容端点」，模型名由用户
 * 自己填，上游没有目录可查。
 */
export function listModels(provider: ProviderName): ModelChoice[] {
    if (provider === 'ollama' || provider === 'custom') return []

    const models = createModels()
    switch (provider) {
        case 'anthropic':
            models.setProvider(anthropicProvider())
            break
        case 'google':
            models.setProvider(googleProvider())
            break
        default:
            models.setProvider(openaiProvider())
            break
    }

    return models.getModels(provider).map((m) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        // pi 的 cost 单位是「每百万 token 美元」。
        inputCostPerMTok: m.cost?.input ?? 0,
        reasoning: m.reasoning,
    }))
}

/** 一次解析的产物：模型集合 + 选中的那个模型。 */
export interface ResolvedModel {
    models: MutableModels
    model: Model<Api>
}

/**
 * 把 PrismMD 的一套连接参数解析成 pi 的 `{ models, model }`。
 *
 * 对 openai/anthropic/google，如果用户填了自定义 `baseUrl`（走代理/网关），
 * 会覆盖到 model 上 —— 上游的 provider 定义是按官方端点写死的。
 */
export function resolveModel(cfg: PiModelConfig): ResolvedModel {
    const models = createModels({ credentials: settingsCredentials(cfg.apiKey) })

    switch (cfg.provider) {
        case 'ollama': {
            const base = `${(cfg.baseUrl ?? DEFAULT_OLLAMA_BASE).replace(/\/+$/, '')}/v1`
            models.setProvider(compatibleProvider('ollama', 'Ollama', cfg.model, base))
            break
        }
        case 'custom': {
            if (!cfg.baseUrl) throw new Error('Custom provider requires a base URL.')
            models.setProvider(
                compatibleProvider('custom', 'Custom', cfg.model, cfg.baseUrl.replace(/\/+$/, '')),
            )
            break
        }
        case 'anthropic':
            models.setProvider(anthropicProvider())
            break
        case 'google':
            models.setProvider(googleProvider())
            break
        case 'openai':
        default:
            models.setProvider(openaiProvider())
            break
    }

    const providerId: string = cfg.provider === 'openai' ? 'openai' : cfg.provider
    let model = models.getModel(providerId, cfg.model)

    if (!model) {
        // 用户填了一个不在上游目录里的模型名 —— 新发布的模型，或者代理商的
        // 自定义别名。不能直接失败：借同 provider 的第一个模型当模板换掉 id，
        // 请求照发，只是 cost/contextWindow 元数据是估的。
        const template = models.getModels(providerId)[0]
        if (!template) throw new Error(`Unknown provider "${cfg.provider}".`)
        model = { ...template, id: cfg.model, name: cfg.model }
    }

    if (cfg.baseUrl && cfg.provider !== 'ollama' && cfg.provider !== 'custom') {
        model = { ...model, baseUrl: cfg.baseUrl.replace(/\/+$/, '') }
    }

    return { models, model }
}

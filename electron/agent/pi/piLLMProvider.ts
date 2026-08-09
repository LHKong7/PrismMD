/**
 * pi/piLLMProvider.ts — 把 pi-ai 接到 PrismMD 既有的 `LLMProvider` 接口上。
 *
 * 这是一个**行为等价的适配器**，不是重新设计。`LLMProvider` /
 * `llmProtocol.ts` 被刻意保留下来当接缝：agentInstance 的工具循环、
 * contextCore 的摘要、toolsCore 的子 agent 三个调用点一行都不用改，
 * 底下的 provider 实现整个换掉。
 *
 * 流式契约照抄原 `providers/openai.ts`：
 *   - 每个文本增量  → `{ content: <delta>, toolCalls: [], usage: {}, model }`
 *   - 最后一次 yield → `{ content: <完整文本>, toolCalls, usage, model, thinking }`
 * 上层的 delta 拆分逻辑依赖这个形状，换契约会静默改变 UI 行为。
 */

import type {
    Api,
    AssistantMessage,
    Context,
    Message,
    Model,
    MutableModels,
    TextContent,
    Tool,
    ToolCall as PiToolCall,
    Usage,
} from '@earendil-works/pi-ai'
import type { ChatMessage, LLMProvider, LLMResponse, ToolCall } from '../llmProtocol'
import { resolveModel, type PiModelConfig } from './models'

/** OpenAI 的 `{type:'function', function:{...}}` 工具定义 → pi 的 `Tool`。 */
function toPiTools(openaiTools?: Record<string, any>[]): Tool[] | undefined {
    if (!openaiTools?.length) return undefined
    return openaiTools.map((t) => {
        const fn = t.function ?? t
        return {
            name: fn.name,
            description: fn.description ?? '',
            // pi 的 `parameters` 标成 TSchema（typebox），但运行时就是一份
            // JSON Schema —— 上层传进来的正是这个形状，直接透传。
            parameters: fn.parameters ?? { type: 'object', properties: {} },
        } as Tool
    })
}

function textBlock(text: string): TextContent {
    return { type: 'text', text }
}

/** 把 content 归一成字符串：上层历史里可能是 string 或 OpenAI 的 parts 数组。 */
function contentToText(content: unknown): string {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
        return content
            .map((p: any) => (typeof p === 'string' ? p : p?.text ?? ''))
            .join('')
    }
    return ''
}

/**
 * 历史里的 assistant 消息要还原成 pi 的 `AssistantMessage`。pi 的类型要求
 * api/provider/model/usage/stopReason 这些「响应元数据」，但历史消息本来
 * 就没有 —— 补成中性值即可，provider 只用 content 和 toolCall 拼请求体。
 */
function historyAssistant(
    model: Model<Api>,
    content: AssistantMessage['content'],
    hasToolCalls: boolean,
): AssistantMessage {
    return {
        role: 'assistant',
        content,
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: hasToolCalls ? 'toolUse' : 'stop',
        timestamp: Date.now(),
    }
}

/**
 * OpenAI 形状的 `ChatMessage[]` → pi 的 `Context`。
 *
 * system 消息抽出去当 `systemPrompt`（pi 把它放在 Context 顶层，
 * 不作为一条 message）。
 */
function toPiContext(
    model: Model<Api>,
    messages: (ChatMessage | Record<string, any>)[],
    tools?: Tool[],
): Context {
    const systemParts: string[] = []
    const out: Message[] = []
    // tool_call_id → toolName，供 toolResult 回填（OpenAI 的 tool 消息不带名字）。
    const toolNameById = new Map<string, string>()

    for (const raw of messages) {
        const m = raw as ChatMessage
        switch (m.role) {
            case 'system': {
                const t = contentToText(m.content)
                if (t) systemParts.push(t)
                break
            }
            case 'user':
                out.push({ role: 'user', content: contentToText(m.content), timestamp: Date.now() })
                break
            case 'assistant': {
                const blocks: AssistantMessage['content'] = []
                const text = contentToText(m.content)
                if (text) blocks.push(textBlock(text))
                for (const tc of m.tool_calls ?? []) {
                    const id = tc.id ?? ''
                    const name = tc.function?.name ?? tc.name ?? ''
                    let args: Record<string, any> = {}
                    const rawArgs = tc.function?.arguments ?? tc.arguments
                    if (typeof rawArgs === 'string') {
                        try { args = JSON.parse(rawArgs || '{}') } catch { args = {} }
                    } else if (rawArgs && typeof rawArgs === 'object') {
                        args = rawArgs
                    }
                    if (id) toolNameById.set(id, name)
                    blocks.push({ type: 'toolCall', id, name, arguments: args } satisfies PiToolCall)
                }
                out.push(historyAssistant(model, blocks, (m.tool_calls?.length ?? 0) > 0))
                break
            }
            case 'tool': {
                const id = m.tool_call_id ?? ''
                out.push({
                    role: 'toolResult',
                    toolCallId: id,
                    toolName: toolNameById.get(id) ?? m.name ?? 'tool',
                    content: [textBlock(contentToText(m.content))],
                    isError: false,
                    timestamp: Date.now(),
                })
                break
            }
            default:
                // 未知角色当用户输入处理，好过整条丢掉。
                out.push({ role: 'user', content: contentToText(m.content), timestamp: Date.now() })
        }
    }

    return {
        systemPrompt: systemParts.join('\n\n') || undefined,
        messages: out,
        tools,
    }
}

/** pi 的 `Usage` → 原 provider 用的 snake_case 计数（`toTokenUsage` 认这个）。 */
function toLegacyUsage(usage: Usage | undefined): Record<string, number> {
    if (!usage) return {}
    return {
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheWrite ?? 0,
        total_tokens: (usage.input ?? 0) + (usage.output ?? 0),
    }
}

/** pi 的 assistant content 块 → 原 `LLMResponse` 的三个字段。 */
function splitAssistant(msg: AssistantMessage): {
    content: string
    thinking: string
    toolCalls: ToolCall[]
} {
    let content = ''
    let thinking = ''
    const toolCalls: ToolCall[] = []
    for (const block of msg.content) {
        if (block.type === 'text') content += block.text
        else if (block.type === 'thinking') thinking += block.thinking
        else if (block.type === 'toolCall') {
            toolCalls.push({ id: block.id, name: block.name, arguments: block.arguments ?? {} })
        }
    }
    return { content, thinking, toolCalls }
}

/**
 * `LLMProvider` 的 pi-ai 实现。构造时解析一次模型，之后复用。
 */
export class PiLLMProvider implements LLMProvider {
    private readonly _models: MutableModels
    private readonly _model: Model<Api>

    constructor(cfg: PiModelConfig) {
        const resolved = resolveModel(cfg)
        this._models = resolved.models
        this._model = resolved.model
    }

    /** 从模型元数据来，取代原来按模型名硬查表的 `getContextWindowForModel`。 */
    get contextWindowSize(): number {
        return this._model.contextWindow
    }

    get supportsStreaming(): boolean {
        return true
    }

    /** 供上层记录用的模型标识。 */
    get modelId(): string {
        return this._model.id
    }

    chat(
        messages: ChatMessage[] | Record<string, any>[],
        options?: { tools?: any[]; temperature?: number; maxTokens?: number; stream?: boolean },
    ): Promise<LLMResponse> | AsyncGenerator<LLMResponse> {
        const context = toPiContext(this._model, messages, toPiTools(options?.tools))
        const streamOptions = {
            maxTokens: options?.maxTokens,
            ...(options?.temperature != null
                ? { samplingParams: { temperature: options.temperature } }
                : {}),
        }

        if (options?.stream) return this._stream(context, streamOptions)
        return this._complete(context, streamOptions)
    }

    /** 非流式：把流跑到底，只返回终态。 */
    private async _complete(context: Context, options: Record<string, any>): Promise<LLMResponse> {
        const stream = this._models.streamSimple(this._model, context, options)
        let final: AssistantMessage | null = null
        for await (const ev of stream) {
            if (ev.type === 'done') final = ev.message
            else if (ev.type === 'error') final = ev.error
        }
        if (!final) throw new Error('LLM stream ended without a final message.')
        if (final.stopReason === 'error' || final.stopReason === 'aborted') {
            throw new Error(final.errorMessage ?? `LLM stopped: ${final.stopReason}`)
        }
        const { content, thinking, toolCalls } = splitAssistant(final)
        return {
            content: content || null,
            toolCalls,
            usage: toLegacyUsage(final.usage),
            model: final.responseModel ?? final.model,
            thinking: thinking || null,
        }
    }

    /**
     * 流式：逐个 text_delta yield 增量，最后补一次带完整内容和 usage 的终态 ——
     * 与原 `providers/openai.ts` 的产出形状逐字对齐。
     */
    private async *_stream(
        context: Context,
        options: Record<string, any>,
    ): AsyncGenerator<LLMResponse> {
        const stream = this._models.streamSimple(this._model, context, options)
        const modelId = this._model.id
        let final: AssistantMessage | null = null

        for await (const ev of stream) {
            if (ev.type === 'text_delta' && ev.delta) {
                yield { content: ev.delta, toolCalls: [], usage: {}, model: modelId }
            } else if (ev.type === 'done') {
                final = ev.message
            } else if (ev.type === 'error') {
                final = ev.error
            }
        }

        if (!final) throw new Error('LLM stream ended without a final message.')
        if (final.stopReason === 'error' || final.stopReason === 'aborted') {
            throw new Error(final.errorMessage ?? `LLM stopped: ${final.stopReason}`)
        }

        const { content, thinking, toolCalls } = splitAssistant(final)
        yield {
            content: content || null,
            toolCalls,
            usage: toLegacyUsage(final.usage),
            model: final.responseModel ?? final.model,
            thinking: thinking || null,
        }
    }
}

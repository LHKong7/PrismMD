/**
 * llmProtocol.ts - LLM provider abstraction for library-style agent usage.
 *
 * Protocol and types allow swapping OpenAI, Anthropic, or local backends without
 * changing the agent loop. chat() accepts list-of-dicts messages and returns
 * normalized LLMResponse (or an async iterator when stream=true).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface LLMResponse {
    content: string | null;
    toolCalls: ToolCall[];
    usage: Record<string, number>;
    model: string;
    /** Extended thinking / reasoning content from models that support it. */
    thinking?: string | null;
}

export interface ChatMessage {
    role: string;
    content?: string | any[];
    tool_calls?: any[];
    tool_call_id?: string;
    [key: string]: any;
}

// ---------------------------------------------------------------------------
// LLMProvider interface
// ---------------------------------------------------------------------------

export interface LLMProvider {
    readonly contextWindowSize: number;
    readonly supportsStreaming: boolean;

    chat(
        messages: ChatMessage[] | Record<string, any>[],
        options?: {
            tools?: any[];
            temperature?: number;
            maxTokens?: number;
            stream?: boolean;
        },
    ): Promise<LLMResponse> | AsyncGenerator<LLMResponse>;
}

// ---------------------------------------------------------------------------
// 实现见 `pi/piLLMProvider.ts`（pi-ai 适配器）。这个文件只留接口 ——
// 它是 agent 循环和 provider 之间的接缝，换 provider 实现时不用动上层。
// ---------------------------------------------------------------------------

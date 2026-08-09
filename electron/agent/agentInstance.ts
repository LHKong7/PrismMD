/**
 * agentInstance.ts — PrismMD 的 agent 门面，跑在 pi-agent-core 的 `Agent` 上。
 *
 * 这一层**只负责 PrismMD 特有的东西**，循环本身交给 pi：
 *
 *   guardrails 过输入 ──┐
 *   历史按预算裁剪    ──┤
 *   ContextBuilder 组 ──┼──→ pi Agent（工具循环 / 流式 / 并行执行 / abort）
 *   装每轮 system      │        │
 *   工具观察后处理    ──┘        └──→ 事件流 → StreamChunk / ChatResult
 *
 * 公共 API（`chat` / `stream` / `runTask` / `close` / `tools` / `telemetry` /
 * `getMetrics`）保持不变 —— `electron/workers/agentWorker.ts` 是唯一消费者，
 * 它和主进程之间的消息协议因此一个字节都不用动。
 *
 * 迁移前这里还挂着 sandbox / builtin 工具 / memory / session 存储 / MCP 客户端 /
 * skills 六个子系统。核实后它们在 PrismMD 的运行时全部不可达（agentWorker 把对应
 * 开关都关着，MCP 走主进程的 mcpService 代理成普通工具传进来），已随本次迁移删除。
 * 详见 recordDocs/2026-08-09-pi-agent-migration-phase2.md。
 */

import { Agent, type AgentTool } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Message, Model, Api, MutableModels } from '@earendil-works/pi-ai';
import {
    ToolDefinition,
    AgentConfig,
    ChatResult,
    StreamChunk,
    AutonomousTaskConfig,
    AutonomousTaskResult,
} from './types';
import { AutonomousLoop } from './autonomousLoop';
import { getBudget, selectHistory, foldObservation } from './contextCore';
import { ContextBuilder } from './contextBuilder';
import { toTokenUsage, mergeTokenUsage, estimateCost, type TokenUsage } from './pricing';
import { Telemetry } from './telemetry';
import { MetricsCollector } from './metrics';
import { GuardPipeline } from './guardrails';
import { resolveModel } from './pi/models';
import { toAgentTools } from './pi/tools';

/** pi 的 Usage → 上层 `toTokenUsage` 认的 snake_case 计数。 */
function legacyUsage(msg: AssistantMessage | null): Record<string, number> {
    if (!msg?.usage) return {};
    return {
        input_tokens: msg.usage.input ?? 0,
        output_tokens: msg.usage.output ?? 0,
        total_tokens: msg.usage.totalTokens ?? 0,
    };
}

/** 渲染层传来的 `{role, content}[]` → pi 的 `Message[]`。 */
function historyToPiMessages(history: Record<string, any>[]): Message[] {
    const out: Message[] = [];
    for (const m of history) {
        const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
        if (!content) continue;
        // 只有 user / assistant 两种 —— aiService 传上来的历史已经滤掉 system，
        // 也不含 tool_calls（见 aiService.ts:148）。
        if (m.role === 'assistant') {
            out.push({
                role: 'assistant',
                content: [{ type: 'text', text: content }],
                api: 'openai-completions',
                provider: 'history',
                model: '',
                usage: {
                    input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
                    totalTokens: 0,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                stopReason: 'stop',
                timestamp: Date.now(),
            });
        } else {
            out.push({ role: 'user', content, timestamp: Date.now() });
        }
    }
    return out;
}

/** 从 pi 的 assistant 消息里取纯文本。 */
function assistantText(msg: AssistantMessage | null): string {
    if (!msg) return '';
    return msg.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('');
}

// ---------------------------------------------------------------------------
// AgentInstance
// ---------------------------------------------------------------------------

export class AgentInstance {
    private _models: MutableModels;
    private _model: Model<Api>;
    private _systemPrompt: string;
    private _tools: ToolDefinition[];
    private _maxToolRounds: number;
    private _maxTokens: number;
    private _contextEnabled: boolean;
    private _guards: GuardPipeline;
    private _telemetry: Telemetry;
    private _metrics: MetricsCollector;
    private _humanInputCallback?: (question: string) => Promise<string> | string;

    /** 当前在跑的 pi Agent，供 abort 用。 */
    private _active: Agent | null = null;

    constructor(config: AgentConfig) {
        const llm = config.llmConfig;
        if (!llm) throw new Error('AgentInstance: llmConfig is required.');
        const resolved = resolveModel({
            provider: llm.provider ?? 'openai',
            model: llm.model ?? '',
            apiKey: llm.apiKey,
            baseUrl: llm.baseUrl,
        });
        this._models = resolved.models;
        this._model = resolved.model;

        this._maxToolRounds = config.maxToolRounds ?? 20;
        this._maxTokens = config.maxTokens ?? 8000;
        this._contextEnabled = config.enableContext ?? true;
        this._guards = config.guards ?? GuardPipeline.defaults();
        this._telemetry = config.telemetry ?? new Telemetry();
        this._metrics = new MetricsCollector();
        this._humanInputCallback = config.humanInputCallback;

        this._tools = [...(config.tools ?? []), this._buildAskUserTool()];

        this._systemPrompt =
            config.systemPrompt ??
            'You are a helpful assistant. Use the provided tools when needed.';
    }

    // ---- Public API ----

    /** 单轮对话（无会话，历史由调用方传入）。 */
    async chat(message: string, history?: Record<string, any>[]): Promise<ChatResult> {
        let result!: ChatResult;
        // 复用流式实现：非流式只是丢掉中间块。两条路径共用一份循环逻辑，
        // 避免它们各自漂移（迁移前是两份近乎重复的 ~90 行）。
        for await (const _ of this._run(message, history ?? [], (r) => { result = r; })) {
            /* drain */
        }
        return result;
    }

    /** 流式单轮对话。 */
    async *stream(
        message: string,
        history?: Record<string, any>[],
    ): AsyncGenerator<StreamChunk> {
        yield* this._run(message, history ?? []);
    }

    /** 已注册的工具（含 ask_user）。 */
    get tools(): ToolDefinition[] {
        return [...this._tools];
    }

    get telemetry(): Telemetry {
        return this._telemetry;
    }

    /** 轮次 / 工具调用 / 错误 / token / 成本 的快照。 */
    getMetrics() {
        return this._metrics.getMetrics();
    }

    /** 自主任务循环（Horse Mode）。 */
    async runTask(config: AutonomousTaskConfig): Promise<AutonomousTaskResult> {
        const loop = new AutonomousLoop(this);
        return loop.run(config);
    }

    /** 中断当前这一轮。worker 的 `abort` 消息走这里。 */
    abort(): void {
        this._active?.abort();
    }

    /**
     * 释放资源。迁移后已无 MCP 连接和沙箱进程要收，保留方法是因为
     * `agentWorker` 的 `safeClose(agent)` 每条路径都会调它。
     */
    async close(): Promise<void> {
        this._active?.abort();
        this._active = null;
    }

    // ---- Internals ----

    private _buildAskUserTool(): ToolDefinition {
        const self = this;
        return {
            name: 'ask_user',
            description:
                'Ask the user a question and wait for their response. ' +
                'Use this when you need clarification, additional information, ' +
                'confirmation on an important decision, or when the task is ambiguous. ' +
                'Do NOT use this for trivial questions you can resolve yourself.',
            parameters: {
                question: { type: 'string', description: 'The question to ask the user' },
            },
            required: ['question'],
            execute: async (args) => {
                const question = args.question ?? '';
                if (!self._humanInputCallback) {
                    return '[Human input not available] No humanInputCallback is configured. Proceed with your best judgment.';
                }
                try {
                    const answer = await self._humanInputCallback(question);
                    return answer || '(User provided no response)';
                } catch (e: any) {
                    return `[Human input error] ${e.message ?? String(e)}`;
                }
            },
        };
    }

    /** 每轮的 system prompt：ContextBuilder 按预算和优先级组装。 */
    private async _buildSystemForTurn(userInput: string): Promise<string> {
        if (!this._contextEnabled) return this._systemPrompt;

        const budget = getBudget();
        // 给 RAG 和项目知识单独切一块输入窗口，不和历史抢。
        const systemBudget = budget.system + Math.floor(budget.rag);

        try {
            const result = await new ContextBuilder({
                baseSystemPrompt: this._systemPrompt,
                includeProjectKnowledge: true,
                includeMemory: false,
                telemetry: this._telemetry,
            }).build(userInput, systemBudget);
            this._telemetry.debug('context', 'system assembled', {
                tokensUsed: result.tokensUsed,
                included: result.included,
                truncated: result.truncated,
                dropped: result.dropped,
            });
            return result.text || this._systemPrompt;
        } catch (e: any) {
            this._telemetry.warn('context', 'context assembly failed; falling back to base system prompt', {
                error: e?.message ?? String(e),
            });
            return this._systemPrompt;
        }
    }

    /** 工具观察的后处理：guardrails 标注 + 超长折叠。 */
    private _transformObservation = async (raw: string): Promise<string> => {
        const guarded = await this._guards.runObservation(raw);
        if (guarded.annotations.length) {
            this._telemetry.debug('guardrails', 'observation annotated', {
                annotations: guarded.annotations,
            });
        }
        return this._contextEnabled ? foldObservation(guarded.value) : guarded.value;
    };

    /**
     * 唯一的循环实现。`chat` 和 `stream` 都走这里 —— 前者丢掉中间块。
     *
     * `onComplete` 在收尾时拿到完整 ChatResult（`chat()` 用它取返回值，
     * 流式调用方则从末块的 `reply` / `usage` 拿）。
     */
    private async *_run(
        userInput: string,
        history: Record<string, any>[],
        onComplete?: (result: ChatResult) => void,
    ): AsyncGenerator<StreamChunk> {
        const turnStart = Date.now();
        const span = this._telemetry.startSpan('agent.turn');

        const sanitized = await this._guards.runInput(userInput);
        if (sanitized.annotations.length) {
            this._telemetry.debug('guardrails', 'input annotated', {
                annotations: sanitized.annotations,
            });
        }
        const message = sanitized.value;
        const system = await this._buildSystemForTurn(message);

        // 历史按预算裁剪；预算算不出结果时至少保住最后两条，避免上下文断裂。
        let workingHistory = [...history];
        if (this._contextEnabled) {
            const selected = selectHistory(workingHistory, message, getBudget().history);
            workingHistory =
                selected.length > 0
                    ? selected
                    : workingHistory.length >= 2
                      ? workingHistory.slice(-2)
                      : [...workingHistory];
        }

        const agentTools: AgentTool<any>[] = toAgentTools(this._tools, this._transformObservation);

        let turns = 0;
        const agent = new Agent({
            initialState: {
                systemPrompt: system,
                model: this._model,
                tools: agentTools,
                messages: historyToPiMessages(workingHistory),
            },
            // maxTokens 是 per-request 的流选项，不是 Agent 级配置 —— 包一层塞进去。
            streamFn: (model, context, options) =>
                this._models.streamSimple(model, context, {
                    ...options,
                    maxTokens: this._maxTokens,
                }),
            // 工具轮次安全上限。pi 在 turn_end 之后、下一次 LLM 调用之前问这个钩子。
            shouldStopAfterTurn: async () => ++turns >= this._maxToolRounds,
        });
        this._active = agent;

        // 事件 → 增量文本 / 指标。pi 的订阅者是被 await 的，所以这里用一个
        // 「推入即唤醒」的队列把事件转成 generator 的 yield，不做轮询。
        const queue: string[] = [];
        let wake: (() => void) | null = null;
        const bump = () => { wake?.(); wake = null; };

        let hadToolCalls = false;
        let toolCallCount = 0;
        const unsubscribe = agent.subscribe((ev) => {
            if (ev.type === 'message_update' && ev.assistantMessageEvent?.type === 'text_delta') {
                if (ev.assistantMessageEvent.delta) {
                    queue.push(ev.assistantMessageEvent.delta);
                    bump();
                }
            } else if (ev.type === 'tool_execution_start') {
                hadToolCalls = true;
                toolCallCount++;
            }
        });

        let failure: string | null = null;
        let finished = false;
        const running = agent.prompt(message).catch((e) => {
            failure = e?.message ?? String(e);
        });
        void running.finally(() => { finished = true; bump(); });

        try {
            while (!finished || queue.length) {
                if (queue.length) {
                    yield { delta: queue.shift()!, done: false };
                    continue;
                }
                await new Promise<void>((r) => { wake = r; });
            }
            await running;
        } finally {
            unsubscribe();
            this._active = null;
        }

        // 末态：从 agent 的消息列表里取最后一条 assistant。
        const messages = agent.state.messages;
        let last: AssistantMessage | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'assistant') {
                last = messages[i] as AssistantMessage;
                break;
            }
        }

        const errored = failure ?? agent.state.errorMessage ?? last?.errorMessage ?? null;
        const reply = errored
            ? `I encountered an error communicating with the AI model: ${errored}. Please try again.`
            : assistantText(last).trim();

        const usage: TokenUsage = mergeTokenUsage(
            { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            toTokenUsage(legacyUsage(last)),
        );
        const model = last?.responseModel ?? last?.model ?? this._model.id;
        const estimatedCost = estimateCost(usage, model);

        const outHistory = [
            ...workingHistory,
            { role: 'user', content: message },
            { role: 'assistant', content: reply },
        ];
        const result: ChatResult = {
            reply,
            history: outHistory,
            hadToolCalls,
            usage,
            estimatedCost,
        };

        this._metrics.recordTurn({
            turnNumber: this._metrics.getMetrics().turnCount + 1,
            hadToolCalls,
            toolCallCount,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            durationMs: Date.now() - turnStart,
            estimatedCost,
            timestamp: Date.now(),
        });
        if (errored) this._metrics.recordError('LLM_ERROR');
        span.setAttributes({
            'agent.turn.input_tokens': usage.inputTokens,
            'agent.turn.output_tokens': usage.outputTokens,
            'agent.turn.had_tool_calls': hadToolCalls,
        });
        span.end();

        onComplete?.(result);
        yield { reply, done: true, usage, estimatedCost };
    }
}

/**
 * contextCore.ts — 上下文预算与裁剪。
 *
 * 只剩三件事：**估 token**、**按预算切历史**、**折叠超长的工具观察**。
 *
 * 这个文件原本是 vendored 进来的 borderless_agent 的上下文管线，还带着
 * TokenBudget / prioritizeMessages / LifecycleManager / assembleSystem /
 * summarizeRounds / 回复缓存 / SourceRegistry 等一整套东西。它们要么从未被
 * 调用，要么在 pi 迁移后被取代（system prompt 组装归 `contextBuilder.ts`，
 * 注入检测归 `guardrails.ts`，工具输出上限随 builtin 工具一起删掉），
 * 已在本次清理中移除。详见
 * recordDocs/2026-08-09-contextcore-dead-export-cleanup.md。
 *
 * 现在的对外面（三个消费者）：
 *   - `agentInstance.ts` → getBudget / selectHistory / foldObservation
 *   - `contextBuilder.ts` → estimateTokens
 *   - `guardrails.ts`     → INJECTION_PATTERNS
 */

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** 粗估：约 3 字符 = 1 token。够用于预算裁剪，不用于计费（计费读 provider 的 usage）。 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.floor(text.length / 3));
}

function estimateMessagesTokens(messages: Record<string, any>[]): number {
    let total = 0;
    for (const m of messages) {
        total += estimateTokens(String(m.role ?? ''));
        const content = m.content;
        if (typeof content === 'string') {
            total += estimateTokens(content);
        } else if (Array.isArray(content)) {
            for (const block of content) {
                if (typeof block === 'object' && block !== null) {
                    if ('text' in block) total += estimateTokens(String(block.text ?? ''));
                    else if ('content' in block) total += estimateTokens(String(block.content ?? ''));
                }
            }
        }
    }
    return total;
}

// ---------------------------------------------------------------------------
// Context window and output limits
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TOKENS = 200_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;
const MAX_OUTPUT_TOKENS_CAP = 64_000;
const CONTEXT_1M_TOKENS = 1_000_000;

const SYSTEM_RESERVE_TOKENS = 1_000;
const RAG_RATIO = 0.40;
const HISTORY_RATIO = 0.50;

/** Anthropic 的 1M 上下文 beta 标识，出现在 `enabledFeatures` 里时放宽窗口。 */
const FEATURE_CONTEXT_1M = 'context-1m-2025-08-07';

function isClaudeSonnet4(model: string): boolean {
    return (model || '').toLowerCase().includes('claude-sonnet-4');
}

function getContextWindowSize(model?: string, enabledFeatures?: string[]): number {
    const m = (model ?? '').trim();
    if (m.includes('[1m]')) return CONTEXT_1M_TOKENS;
    if ((enabledFeatures ?? []).includes(FEATURE_CONTEXT_1M) && isClaudeSonnet4(m)) {
        return CONTEXT_1M_TOKENS;
    }
    return DEFAULT_MAX_TOKENS;
}

function getMaxOutputTokens(model?: string): number {
    const raw = (process.env.AGENT_MAX_OUTPUT_TOKENS ?? '').trim();
    if (raw) {
        const val = parseInt(raw, 10);
        if (val > 0) return Math.min(val, MAX_OUTPUT_TOKENS_CAP);
    }
    const ml = (model ?? '').toLowerCase();
    if (ml.includes('3-5')) return 8192;
    if (ml.includes('claude-3-opus')) return 4096;
    if (ml.includes('claude-3-sonnet')) return 8192;
    if (ml.includes('claude-3-haiku')) return 4096;
    if (ml.includes('opus-4-5')) return 64_000;
    if (ml.includes('opus-4')) return 32_000;
    if (ml.includes('sonnet-4') || ml.includes('haiku-4')) return 64_000;
    return DEFAULT_MAX_OUTPUT_TOKENS;
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

/**
 * 把上下文窗口切成几块。`system` 和 `rag` 由 ContextBuilder 消费，
 * `history` 由 selectHistory 消费。
 */
export function getBudget(options?: {
    total?: number;
    model?: string;
    enabledFeatures?: string[];
}): Record<string, number> {
    const total = options?.total ?? getContextWindowSize(options?.model, options?.enabledFeatures);
    const outputReserve = getMaxOutputTokens(options?.model);
    const inputBudget = Math.max(0, total - outputReserve);
    return {
        total,
        system: SYSTEM_RESERVE_TOKENS,
        rag: Math.floor(inputBudget * RAG_RATIO),
        history: Math.floor(inputBudget * HISTORY_RATIO),
        output_reserve: outputReserve,
    };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/**
 * 按 token 预算从**前面**丢历史（保住最近的轮次）。先按轮数硬截断，
 * 再逐条从头剪到装得下。
 *
 * 注意：预算极小时**会返回空数组** —— 循环的最后一次 `slice(capped.length)`
 * 得到 `[]`，而 `0 <= maxTokens` 恒真。「至少留最后两条」的保底不在这里，
 * 在调用方（`agentInstance._run`）：`selected.length > 0 ? selected : history.slice(-2)`。
 * 下面那行 return 因此不可达，保留只为万一循环条件被改动时仍有兜底。
 */
export function selectHistory(
    history: Record<string, any>[],
    userInput: string,
    maxTokens: number,
    maxTurns: number = 30,
): Record<string, any>[] {
    if (!history.length) return [];
    const capped =
        history.length > maxTurns * 2 ? history.slice(-(maxTurns * 2)) : [...history];
    if (estimateMessagesTokens(capped) <= maxTokens) return capped;
    for (let i = 1; i <= capped.length; i++) {
        const trimmed = capped.slice(i);
        if (estimateMessagesTokens(trimmed) <= maxTokens) return trimmed;
    }
    /* c8 ignore next */
    return capped.length >= 2 ? capped.slice(-2) : capped;
}

// ---------------------------------------------------------------------------
// Compressor
// ---------------------------------------------------------------------------

const OBSERVATION_MAX_CHARS = 3500;

/** 超长的工具输出折成「首段 + 尾段」摘要，防止一次观察吃掉整个窗口。 */
export function foldObservation(raw: string, maxChars: number = OBSERVATION_MAX_CHARS): string {
    if (!raw || raw.length <= maxChars) return raw;
    const head = raw.slice(0, Math.floor(maxChars / 2)).trim();
    const tail = raw.length > 500 ? raw.slice(-500).trim() : '';
    const summary = `[Data too long (${raw.length} chars). First part: ${head.slice(0, 200)}... Last part: ...${tail.slice(-150)}]`;
    return summary.slice(0, maxChars);
}

// ---------------------------------------------------------------------------
// Injection defense
// ---------------------------------------------------------------------------

/** 提示注入的常见开场白。由 `guardrails.injectionDetectionGuard` 使用。 */
export const INJECTION_PATTERNS: RegExp[] = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i,
    /disregard\s+(all\s+)?(previous|above)/i,
    /你的?\s*新\s*身份/,
    /你的?\s*新\s*角色/,
    /from\s+now\s+on/i,
    /new\s+instructions/i,
    /system\s*:\s*you\s+are/i,
    /<\|im_start\|>\s*system/i,
];

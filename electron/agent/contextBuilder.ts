/**
 * contextBuilder.ts — Priority-aware context assembly.
 *
 * Replaces the ad-hoc "stitch strings together" approach in
 * AgentInstance._buildSystemForTurn with a typed source registry that:
 *
 *   - Registers contributing sources (system prompt, project knowledge,
 *     user preferences, RAG memories, conversation summary, skills, etc.)
 *     each with a category, priority [0..1], and estimated token cost.
 *   - Assembles them respecting a token budget. Sources are added in
 *     priority order; once the budget is exhausted, remaining sources
 *     are dropped, except high-priority (>= 0.6) sources which are
 *     truncated rather than discarded.
 *
 * The registry is intentionally a value type (per turn) rather than a
 * long-lived global so concurrent turns don't fight over the same state.
 */

import { estimateTokens } from './contextCore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceCategory =
    | 'system'
    | 'project'
    | 'preferences'
    | 'rag'
    | 'summary'
    | 'skill'
    | 'pattern'
    | 'instruction';

export interface ContextSource {
    /** Unique name. Re-registering with the same name overwrites. */
    name: string;
    /** Markdown / plain text body to inject. */
    content: string;
    /** Priority in [0..1]. Higher = added first; >= 0.6 may be truncated. */
    priority: number;
    /** Logical category — used for ordering ties and for metrics. */
    category: SourceCategory;
    /** Optional token cap. Defaults to estimateTokens(content). */
    maxTokens?: number;
    /** Optional title rendered as a Markdown heading. */
    title?: string;
}

export interface AssembleResult {
    /** Final assembled system prompt. */
    text: string;
    /** Names of sources that were included in full. */
    included: string[];
    /** Names of high-priority sources whose content was truncated. */
    truncated: string[];
    /** Names of sources skipped for budget reasons. */
    dropped: string[];
    /** Estimated token usage of the final assembly. */
    tokensUsed: number;
}

// ---------------------------------------------------------------------------
// SourceRegistry
// ---------------------------------------------------------------------------

const TRUNCATABLE_PRIORITY = 0.6;
/** Approximate chars-per-token for our 1/3 estimator. */
const CHARS_PER_TOKEN = 3;

export class SourceRegistry {
    private readonly _sources: Map<string, ContextSource> = new Map();

    register(source: ContextSource): void {
        const tokens = source.maxTokens ?? estimateTokens(source.content);
        this._sources.set(source.name, { ...source, maxTokens: tokens });
    }

    /** Drop a source. Useful for skill unload. */
    remove(name: string): void {
        this._sources.delete(name);
    }

    has(name: string): boolean { return this._sources.has(name); }
    get(name: string): ContextSource | undefined { return this._sources.get(name); }
    list(): ContextSource[] { return Array.from(this._sources.values()); }
    clear(): void { this._sources.clear(); }

    /**
     * Assemble all registered sources into a single system prompt under
     * the given token budget. Sources are sorted by priority desc, then
     * by registration order; items with priority >= 0.6 may be truncated
     * to fit remaining budget; everything below that threshold is dropped
     * once the budget is exhausted.
     */
    assemble(budgetTokens: number): AssembleResult {
        const sorted = Array.from(this._sources.values()).sort(
            (a, b) => b.priority - a.priority,
        );

        const parts: string[] = [];
        const included: string[] = [];
        const truncated: string[] = [];
        const dropped: string[] = [];
        let used = 0;

        for (const src of sorted) {
            const cost = src.maxTokens ?? estimateTokens(src.content);
            const remaining = budgetTokens - used;
            const block = renderBlock(src, src.content);

            if (cost <= remaining) {
                parts.push(block);
                used += cost;
                included.push(src.name);
                continue;
            }

            // Try truncation for important sources only.
            if (src.priority >= TRUNCATABLE_PRIORITY && remaining > 32) {
                const maxChars = Math.max(0, remaining * CHARS_PER_TOKEN - 32);
                if (maxChars > 0) {
                    const cut = src.content.slice(0, maxChars).trimEnd() + '\n\n…[truncated]';
                    parts.push(renderBlock(src, cut));
                    used += estimateTokens(cut);
                    truncated.push(src.name);
                    continue;
                }
            }

            dropped.push(src.name);
        }

        return {
            text: parts.join('\n\n'),
            included,
            truncated,
            dropped,
            tokensUsed: used,
        };
    }
}

function renderBlock(src: ContextSource, content: string): string {
    if (src.title) return `${src.title}\n${content}`;
    if (src.category === 'system') return content;
    // Fallback heading derived from category.
    const heading: Record<SourceCategory, string> = {
        system: '',
        project: '**Project context:**',
        preferences: '**User preferences:**',
        rag: '**Relevant past context (long-term memory):**',
        summary: '**Conversation summary:**',
        skill: '**Loaded skill:**',
        pattern: '**Recognised patterns:**',
        instruction: '**Processing note:**',
    };
    return `${heading[src.category]}\n${content}`;
}

// ---------------------------------------------------------------------------
// ContextBuilder
// ---------------------------------------------------------------------------

import * as fs from 'fs';
import * as path from 'path';
import type { Telemetry } from './telemetry';
import { WORKDIR } from './config';

/**
 * 项目级知识：工作目录下的 `CLAUDE.md`。
 *
 * 原先在 `memoryCore.ts`，随 pi 迁移把 memoryCore 删掉后并到这里 —— 它是
 * memoryCore 里唯一被实际调用的读取函数（`includeProjectKnowledge` 默认开）。
 */
function loadProjectKnowledge(): string | null {
    const claudeMd = path.join(WORKDIR, 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) return null;
    try {
        return fs.readFileSync(claudeMd, 'utf-8').trim();
    } catch {
        return null;
    }
}

export interface ContextBuilderOptions {
    /** Base system prompt — always included at top priority. */
    baseSystemPrompt: string;
    /** Whether to include project knowledge (CLAUDE.md). Default: true. */
    includeProjectKnowledge?: boolean;
    /** Whether to retrieve RAG memories. Default: false. */
    includeMemory?: boolean;
    /** Top-k memories to retrieve. Default: 5. */
    memoryK?: number;
    /** Names of currently-loaded skills (registered separately by the caller). */
    activeSkills?: { name: string; body: string }[];
    /** Optional telemetry for memory.retrieve span. */
    telemetry?: Telemetry;
}

export interface BuildContextResult extends AssembleResult {
    /** The registry that was assembled (callers can inspect it). */
    registry: SourceRegistry;
}

export class ContextBuilder {
    private readonly _options: ContextBuilderOptions;

    constructor(options: ContextBuilderOptions) {
        this._options = options;
    }

    /**
     * Build a budget-aware system prompt for a single turn. The assembled
     * text is suitable for the `system` message handed to the LLM.
     */
    async build(userInput: string, budgetTokens: number): Promise<BuildContextResult> {
        const registry = new SourceRegistry();

        // 1) Base system prompt — always highest priority.
        registry.register({
            name: 'system',
            content: this._options.baseSystemPrompt,
            priority: 1.0,
            category: 'system',
        });

        // 2) Project knowledge (CLAUDE.md) if available.
        if (this._options.includeProjectKnowledge !== false) {
            const pk = loadProjectKnowledge();
            if (pk) {
                registry.register({
                    name: 'project_knowledge',
                    content: pk.slice(0, 4000),
                    priority: 0.85,
                    category: 'project',
                });
            }
        }

        // 3) Active skills (caller supplies — typically from SkillLifecycleManager).
        if (this._options.activeSkills?.length) {
            for (const skill of this._options.activeSkills) {
                registry.register({
                    name: `skill:${skill.name}`,
                    content: skill.body,
                    priority: 0.8,
                    category: 'skill',
                    title: `**Loaded skill: ${skill.name}**`,
                });
            }
        }

        // 迁移前这里还有第 4 段「RAG memories」，从 memoryCore 检索向量记忆。
        // PrismMD 从未开启过它（agentWorker 一直是 enableMemory(false)），
        // memoryCore 已随 pi 迁移删除。`includeMemory` 选项保留但不再有作用 ——
        // 真正要做笔记 RAG 的话，主进程的 workspaceDb 里已经有 note_embeddings 表。

        const result = registry.assemble(budgetTokens);
        return { ...result, registry };
    }
}

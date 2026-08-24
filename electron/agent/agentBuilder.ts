/**
 * agentBuilder.ts — Fluent builder for creating agent instances.
 *
 * Usage:
 * ```ts
 * const agent = new AgentBuilder()
 *   .setProvider('openai', { apiKey: 'sk-...', model: 'gpt-4o' })
 *   .setSystemPrompt('You are a helpful assistant.')
 *   .addTool({ name: 'greet', description: 'Say hi', execute: () => 'Hi!' })
 *   .build();
 * ```
 *
 * 迁到 pi 之前这里还有 `addSkill` / `setStorage` / `enableMemory` /
 * `setSandbox` / `addMCPServer` / `setApprovalCallback` / `setEmbeddingProvider`
 * / `setIncludeBuiltinTools` 等一批 setter —— 全部无人调用（`electron/agent/`
 * 是 vendored 进来的 borderless_agent 全量拷贝，PrismMD 只用其中一小片），
 * 对应的子系统已随迁移删除。详见
 * recordDocs/2026-08-09-pi-agent-migration-phase2.md。
 */

import { ToolDefinition, AgentConfig, LLMConfig } from './types';
import type { ProviderName } from './pi/models';
import { setModelPricing as _setModelPricing, type ModelPricing } from './pricing';
import { AgentInstance } from './agentInstance';

/**
 * 只在调用方没给 model 时兜底。ollama / custom 没有合理默认值 —— 模型名由
 * 用户在设置里填，缺了就让 pi 报「provider 未知模型」，好过默默连错模型。
 */
const DEFAULT_MODELS: Record<ProviderName, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-sonnet-4-20250514',
    google: 'gemini-2.0-flash',
    ollama: '',
    custom: '',
};

export class AgentBuilder {
    private _config: AgentConfig = {
        enableContext: true,
        maxToolRounds: 20,
        tools: [],
    };

    // ---- LLM ----

    /** Provide an LLM config (provider selected via `config.provider`). */
    setLLM(config: LLMConfig): this {
        this._config.llmConfig = config;
        return this;
    }

    /**
     * Shorthand: select a provider by name and configure it.
     * All providers support baseUrl for API-compatible endpoints.
     *
     * @example
     * builder.setProvider('anthropic', { apiKey: 'sk-ant-...', model: 'claude-sonnet-4-20250514' })
     * builder.setProvider('ollama', { apiKey: '', model: 'llama3.1:8b' })
     * builder.setProvider('custom', { apiKey: 'k', model: 'm', baseUrl: 'https://vllm.internal/v1' })
     */
    setProvider(provider: ProviderName, config: LLMConfig): this {
        this._config.llmConfig = { ...config, provider };
        return this;
    }

    // ---- System prompt ----

    /** Set the base system prompt the agent uses. */
    setSystemPrompt(prompt: string): this {
        this._config.systemPrompt = prompt;
        return this;
    }

    // ---- Tools ----

    /** Add a single user-defined tool. */
    addTool(tool: ToolDefinition): this {
        this._config.tools = this._config.tools ?? [];
        this._config.tools.push(tool);
        return this;
    }

    /** Add multiple user-defined tools at once. */
    addTools(tools: ToolDefinition[]): this {
        this._config.tools = this._config.tools ?? [];
        this._config.tools.push(...tools);
        return this;
    }

    // ---- Feature toggles ----

    /** Enable context management (token budgeting, history trimming). */
    enableContext(enable: boolean = true): this {
        this._config.enableContext = enable;
        return this;
    }

    /** Max tool rounds per turn (safety limit). */
    setMaxToolRounds(max: number): this {
        this._config.maxToolRounds = Math.max(1, Math.min(max, 100));
        return this;
    }

    /** Max output tokens per LLM call. */
    setMaxTokens(max: number): this {
        this._config.maxTokens = max;
        return this;
    }

    /**
     * Set callback for human-in-the-loop interaction.
     * When the agent needs clarification or input from the user mid-task,
     * it calls the `ask_user` tool which invokes this callback.
     */
    setHumanInputCallback(cb: (question: string) => Promise<string> | string): this {
        this._config.humanInputCallback = cb;
        return this;
    }

    // ---- Pricing ----

    /** Override model pricing for cost estimation. */
    setModelPricing(pricing: Record<string, ModelPricing>): this {
        _setModelPricing(pricing);
        return this;
    }

    // ---- Build ----

    /** Validate config and build the agent instance. */
    build(): AgentInstance {
        const cfg = this._config.llmConfig;
        if (!cfg) {
            throw new Error('AgentBuilder: must call .setLLM() or .setProvider() before .build()');
        }
        const provider = cfg.provider ?? 'openai';
        this._config.llmConfig = {
            ...cfg,
            provider,
            model: cfg.model || DEFAULT_MODELS[provider],
        };
        return new AgentInstance({ ...this._config });
    }
}

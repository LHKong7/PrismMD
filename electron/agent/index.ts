/**
 * index.ts — Public barrel export for the agent module.
 *
 * Usage:
 * ```ts
 * import { AgentBuilder } from '../agent';
 *
 * const agent = new AgentBuilder()
 *   .setProvider('openai', { apiKey: 'sk-...' })
 *   .setSystemPrompt('You are helpful.')
 *   .build();
 *
 * const result = await agent.chat('Hello');
 * ```
 *
 * 循环本身跑在 `@earendil-works/pi-agent-core` 上，provider 层是
 * `@earendil-works/pi-ai`。这里只导出 PrismMD 自己那一层。
 */

// ---- Builder & Instance ----
export { AgentBuilder } from './agentBuilder';
export { AgentInstance } from './agentInstance';

// ---- Public types ----
export type {
    ToolDefinition,
    AgentConfig,
    LLMConfig,
    StorageConfig,
    ChatResult,
    StreamChunk,
    AgentSession,
    AutonomousTaskConfig,
    AutonomousTaskResult,
    IterationProgress,
    AutonomousPhase,
} from './types';

// ---- Models (pi-ai backed) ----
export { resolveModel } from './pi/models';
export type { ProviderName, PiModelConfig, ResolvedModel } from './pi/models';

// ---- Pricing & Token Usage ----
export {
    type TokenUsage,
    type ModelPricing,
    getModelPricing,
    setModelPricing,
    estimateCost,
    toTokenUsage,
    mergeTokenUsage,
} from './pricing';

// ---- Session persistence (used directly by electron/services/sessionService) ----
export { createFileBackend as createFileStorage } from './storage/fileBackend';
export { StorageBackend } from './storage/protocols';
export type { SessionStore, MemoryStore, SkillStore, ContextStore } from './storage/protocols';
export { SessionManager, Session } from './sessionCore';

// ---- Telemetry & metrics ----
export { Telemetry, ConsoleExporter, MemoryExporter } from './telemetry';
export type {
    Span,
    SpanData,
    SpanStatus,
    LogEntry,
    LogLevel,
    TelemetryExporter,
    TelemetryConfig,
} from './telemetry';
export { MetricsCollector } from './metrics';
export type { TurnMetrics, ToolMetrics, AgentMetricsSnapshot } from './metrics';

// ---- Context assembly ----
export { ContextBuilder, SourceRegistry } from './contextBuilder';
export type {
    ContextSource,
    SourceCategory,
    AssembleResult,
    ContextBuilderOptions,
    BuildContextResult,
} from './contextBuilder';

// ---- Guardrails ----
export {
    GuardPipeline,
    injectionDetectionGuard,
    piiRedactionGuard,
    DEFAULT_PII_PATTERNS,
} from './guardrails';
export type { Guard, GuardContext, GuardResult, GuardOutcome, GuardPipelineOptions } from './guardrails';

// ---- Errors ----
export {
    AgentError,
    LLMError,
    RateLimitError,
    AuthenticationError,
    ContextOverflowError,
    ToolError,
    ToolTimeoutError,
    ToolExecutionError,
    ValidationError,
    ConfigurationError,
} from './errors';

// ---- Context helpers ----
export {
    estimateTokens,
    getBudget,
    selectHistory,
    foldObservation,
} from './contextCore';

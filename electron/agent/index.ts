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
 */

// ---- Builder & Instance ----
export { AgentBuilder } from './agentBuilder';
export { AgentInstance } from './agentInstance';

// ---- Public types ----
export type {
    ToolDefinition,
    SkillDefinition,
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

// ---- LLM providers (pi-ai backed) ----
export { PiLLMProvider } from './pi/piLLMProvider';
export { resolveModel } from './pi/models';
export type { ProviderName, PiModelConfig, ResolvedModel } from './pi/models';
export type { LLMProvider, LLMResponse, ToolCall, ChatMessage } from './llmProtocol';

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

// ---- Storage helpers ----
export { createFileBackend as createFileStorage } from './storage/fileBackend';
export { StorageBackend } from './storage/protocols';
export type { SessionStore, MemoryStore, SkillStore, ContextStore } from './storage/protocols';

// ---- Session manager ----
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

// ---- Composition root ----
export { AgentHarness, ToolRegistry } from './harness';
export type { HarnessConfig } from './harness';

// ---- Guardrails ----
export {
    GuardPipeline,
    injectionDetectionGuard,
    piiRedactionGuard,
    DEFAULT_PII_PATTERNS,
} from './guardrails';
export type { Guard, GuardContext, GuardResult, GuardOutcome, GuardPipelineOptions } from './guardrails';

// ---- Skills (registry + lifecycle) ----
export { SkillRegistry } from './skillRegistry';
export { SkillLifecycleManager } from './skillLifecycle';
export type { SkillContext } from './types';
export type { SkillLoadResult, SkillLifecycleManagerOptions } from './skillLifecycle';

// ---- Tool execution ----
export { ToolExecutor } from './toolExecutor';
export type {
    ToolCallRequest,
    ToolCallResult,
    ExecutionPlan,
    ToolExecutorContext,
    ToolExecutorOptions,
} from './toolExecutor';

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
    assembleSystem,
    sanitizeUserInput,
    LifecycleManager,
} from './contextCore';

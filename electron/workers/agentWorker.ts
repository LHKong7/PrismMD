/**
 * agentWorker.ts — Worker thread for agent LLM operations.
 *
 * Runs AgentBuilder/AgentInstance in a separate thread to avoid blocking
 * the Electron main process. Communicates with main via parentPort messages.
 *
 * Message protocol:
 *   Main → Worker:  { type: 'stream'|'chat'|'run-task'|'test'|'abort'|'tool-result', ... }
 *   Worker → Main:  { type: 'chunk'|'progress'|'result'|'error'|'tool-call-request', ... }
 */
import { parentPort } from 'worker_threads'
import { AgentBuilder } from '../agent'
import type { AgentInstance, ToolDefinition } from '../agent'
import { mapProvider, safeClose } from '../services/providerUtils'

if (!parentPort) throw new Error('agentWorker must be run as a worker thread')

// ─── Abort Flag ─────────────────────────────────────────────────────────────

let aborted = false

function checkAbort(): boolean {
  return aborted
}

// ─── Tool Call Proxy ────────────────────────────────────────────────────────

const pendingToolCalls = new Map<string, { resolve: (result: string) => void }>()

function createProxiedTools(
  toolDefs: Array<{ name: string; description: string; parameters?: Record<string, any>; required?: string[] }>,
): ToolDefinition[] {
  return toolDefs.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: def.parameters,
    required: def.required,
    execute: async (args: Record<string, any>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      parentPort!.postMessage({ type: 'tool-call-request', id, name: def.name, args })
      return new Promise<string>((resolve) => {
        pendingToolCalls.set(id, { resolve })
      })
    },
  }))
}

// ─── Agent Builder Helper ───────────────────────────────────────────────────

interface ProviderConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}

function buildAgent(
  providerConfig: ProviderConfig,
  systemPrompt: string,
  options?: {
    toolDefs?: Array<{ name: string; description: string; parameters?: Record<string, any>; required?: string[] }>
    maxToolRounds?: number
  },
): AgentInstance {
  const { providerName, config } = mapProvider(providerConfig)
  const builder = new AgentBuilder()
    .setProvider(providerName, config)
    .setSystemPrompt(systemPrompt)
    .setIncludeBuiltinTools(false)
    .enableContext(true)
    .enableMemory(false)
    .setMaxToolRounds(options?.maxToolRounds ?? 8)

  if (options?.toolDefs?.length) {
    builder.addTools(createProxiedTools(options.toolDefs))
  }

  return builder.build()
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleStream(msg: {
  provider: ProviderConfig
  systemPrompt: string
  message: string
  history: Array<{ role: string; content: string }>
}) {
  aborted = false
  const agent = buildAgent(msg.provider, msg.systemPrompt)
  try {
    const stream = agent.stream(msg.message, msg.history)
    for await (const chunk of stream) {
      if (aborted) break
      if (chunk.delta) {
        parentPort!.postMessage({ type: 'chunk', delta: chunk.delta })
      }
    }
    parentPort!.postMessage({ type: 'result', reply: '', done: true })
  } catch (err) {
    parentPort!.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    await safeClose(agent)
  }
}

async function handleChat(msg: {
  provider: ProviderConfig
  systemPrompt: string
  message: string
  history?: Array<{ role: string; content: string }>
  toolDefs?: Array<{ name: string; description: string; parameters?: Record<string, any>; required?: string[] }>
  maxToolRounds?: number
}) {
  aborted = false
  const agent = buildAgent(msg.provider, msg.systemPrompt, {
    toolDefs: msg.toolDefs,
    maxToolRounds: msg.maxToolRounds,
  })
  try {
    const result = await agent.chat(msg.message, msg.history)
    parentPort!.postMessage({
      type: 'result',
      reply: result.reply,
      hadToolCalls: result.hadToolCalls,
      usage: result.usage,
    })
  } catch (err) {
    parentPort!.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    await safeClose(agent)
  }
}

async function handleRunTask(msg: {
  provider: ProviderConfig
  systemPrompt: string
  task: string
  qualityThreshold?: number
  maxIterations?: number
}) {
  aborted = false
  const agent = buildAgent(msg.provider, msg.systemPrompt)
  try {
    const result = await agent.runTask({
      task: msg.task,
      qualityThreshold: msg.qualityThreshold ?? 7,
      maxIterations: msg.maxIterations ?? 5,
      onProgress: (progress) => {
        if (aborted) return false
        parentPort!.postMessage({
          type: 'progress',
          iteration: progress.iteration,
          phase: progress.phase,
          qualityScore: progress.qualityScore,
        })
      },
    })
    parentPort!.postMessage({
      type: 'result',
      result: result.result,
      iterations: result.iterations,
      qualityScore: result.qualityScore,
      thresholdMet: result.thresholdMet,
    })
  } catch (err) {
    parentPort!.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  } finally {
    await safeClose(agent)
  }
}

async function handleTest(msg: { provider: ProviderConfig }) {
  aborted = false
  const agent = buildAgent(msg.provider, 'You are a test assistant.')
  try {
    const result = await agent.chat('hi')
    parentPort!.postMessage({ type: 'result', success: !!result.reply })
  } catch {
    parentPort!.postMessage({ type: 'result', success: false })
  } finally {
    await safeClose(agent)
  }
}

// ─── Message Dispatcher ─────────────────────────────────────────────────────

parentPort.on('message', (msg: { type: string; [key: string]: any }) => {
  switch (msg.type) {
    case 'stream':
      void handleStream(msg as any)
      break
    case 'chat':
      void handleChat(msg as any)
      break
    case 'run-task':
      void handleRunTask(msg as any)
      break
    case 'test':
      void handleTest(msg as any)
      break
    case 'abort':
      aborted = true
      break
    case 'tool-result': {
      const pending = pendingToolCalls.get(msg.id)
      if (pending) {
        pending.resolve(msg.result)
        pendingToolCalls.delete(msg.id)
      }
      break
    }
  }
})

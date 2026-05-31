/**
 * Agent Worker Manager — manages the worker_threads Worker for agent operations.
 *
 * Provides async methods (stream, chat, runTask, test) that communicate
 * with the agentWorker via structured messages. MCP tool calls are proxied
 * back from the worker to the main thread for execution.
 */
import { Worker } from 'worker_threads'
import * as path from 'path'
import { app } from 'electron'
import { callTool as callMcpTool } from './mcpService'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderConfig {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}

interface ToolDef {
  name: string
  description: string
  parameters?: Record<string, any>
  required?: string[]
}

interface StreamConfig {
  provider: ProviderConfig
  systemPrompt: string
  message: string
  history: Array<{ role: string; content: string }>
}

interface ChatConfig {
  provider: ProviderConfig
  systemPrompt: string
  message: string
  history?: Array<{ role: string; content: string }>
  toolDefs?: ToolDef[]
  maxToolRounds?: number
}

interface RunTaskConfig {
  provider: ProviderConfig
  systemPrompt: string
  task: string
  qualityThreshold?: number
  maxIterations?: number
}

export interface ChatResult {
  reply: string
  hadToolCalls?: boolean
  usage?: Record<string, number>
}

export interface RunTaskResult {
  result: string
  iterations: number
  qualityScore: number
  thresholdMet: boolean
}

// ─── Worker Manager ─────────────────────────────────────────────────────────

class AgentWorkerManager {
  private worker: Worker | null = null
  private busy = false
  private pendingResolve: ((value: any) => void) | null = null
  private pendingReject: ((err: Error) => void) | null = null
  private onChunk: ((delta: string) => void) | null = null
  private onProgress: ((progress: { iteration: number; phase: string; qualityScore?: number }) => void) | null = null

  private getWorkerPath(): string {
    // In dev mode, the worker is compiled by Vite alongside main.js
    // In production, it's in the same directory as the main bundle
    if (app.isPackaged) {
      return path.join(__dirname, 'agentWorker.js')
    }
    return path.join(__dirname, 'agentWorker.js')
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker

    this.worker = new Worker(this.getWorkerPath())

    this.worker.on('message', (msg: { type: string; [key: string]: any }) => {
      switch (msg.type) {
        case 'chunk':
          this.onChunk?.(msg.delta)
          break
        case 'progress':
          this.onProgress?.({ iteration: msg.iteration, phase: msg.phase, qualityScore: msg.qualityScore })
          break
        case 'result':
          this.busy = false
          this.pendingResolve?.(msg)
          this.pendingResolve = null
          this.pendingReject = null
          break
        case 'error':
          this.busy = false
          this.pendingReject?.(new Error(msg.message))
          this.pendingResolve = null
          this.pendingReject = null
          break
        case 'tool-call-request':
          void this.handleToolCallRequest(msg.id, msg.name, msg.args)
          break
      }
    })

    this.worker.on('error', (err) => {
      this.busy = false
      this.pendingReject?.(err)
      this.pendingResolve = null
      this.pendingReject = null
      // Worker crashed — clear reference so next call spawns a new one
      this.worker = null
    })

    this.worker.on('exit', (code) => {
      if (code !== 0) {
        this.pendingReject?.(new Error(`Agent worker exited with code ${code}`))
        this.pendingResolve = null
        this.pendingReject = null
      }
      this.busy = false
      this.worker = null
    })

    return this.worker
  }

  private async handleToolCallRequest(id: string, toolName: string, args: Record<string, any>) {
    // Parse serverId from qualified name (format: "serverId__toolName")
    const sep = toolName.indexOf('__')
    const serverId = sep > 0 ? toolName.slice(0, sep) : toolName
    const actualName = sep > 0 ? toolName.slice(sep + 2) : toolName

    let result: string
    try {
      const output = await callMcpTool(serverId, actualName, args)
      result = typeof output === 'string' ? output : JSON.stringify(output)
    } catch (err) {
      result = `Error: ${err instanceof Error ? err.message : String(err)}`
    }

    this.worker?.postMessage({ type: 'tool-result', id, result })
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Stream a chat message. Calls onChunkCb for each text delta.
   * Resolves when streaming is complete.
   */
  async stream(
    config: StreamConfig,
    onChunkCb: (delta: string) => void,
  ): Promise<void> {
    if (this.busy) throw new Error('Agent worker is busy. Wait for current operation to complete.')
    this.busy = true
    this.onChunk = onChunkCb

    const worker = this.ensureWorker()

    return new Promise<void>((resolve, reject) => {
      this.pendingResolve = () => { this.onChunk = null; resolve() }
      this.pendingReject = (err) => { this.onChunk = null; reject(err) }
      worker.postMessage({ type: 'stream', ...config })
    })
  }

  /**
   * Non-streaming chat call. Returns the full reply.
   */
  async chat(config: ChatConfig): Promise<ChatResult> {
    if (this.busy) throw new Error('Agent worker is busy. Wait for current operation to complete.')
    this.busy = true

    const worker = this.ensureWorker()

    return new Promise<ChatResult>((resolve, reject) => {
      this.pendingResolve = (msg) => resolve({ reply: msg.reply, hadToolCalls: msg.hadToolCalls, usage: msg.usage })
      this.pendingReject = reject
      worker.postMessage({ type: 'chat', ...config })
    })
  }

  /**
   * Run an autonomous task loop (plan → execute → review → evaluate).
   * Calls onProgressCb after each phase.
   */
  async runTask(
    config: RunTaskConfig,
    onProgressCb?: (progress: { iteration: number; phase: string; qualityScore?: number }) => void,
  ): Promise<RunTaskResult> {
    if (this.busy) throw new Error('Agent worker is busy. Wait for current operation to complete.')
    this.busy = true
    this.onProgress = onProgressCb ?? null

    const worker = this.ensureWorker()

    return new Promise<RunTaskResult>((resolve, reject) => {
      this.pendingResolve = (msg) => {
        this.onProgress = null
        resolve({ result: msg.result, iterations: msg.iterations, qualityScore: msg.qualityScore, thresholdMet: msg.thresholdMet })
      }
      this.pendingReject = (err) => { this.onProgress = null; reject(err) }
      worker.postMessage({ type: 'run-task', ...config })
    })
  }

  /**
   * Quick connectivity test. Returns true if the provider responds.
   */
  async test(provider: ProviderConfig): Promise<boolean> {
    if (this.busy) throw new Error('Agent worker is busy. Wait for current operation to complete.')
    this.busy = true

    const worker = this.ensureWorker()

    return new Promise<boolean>((resolve) => {
      this.pendingResolve = (msg) => resolve(!!msg.success)
      this.pendingReject = () => resolve(false)
      worker.postMessage({ type: 'test', provider })
    })
  }

  /**
   * Abort the current operation.
   */
  abort(): void {
    this.worker?.postMessage({ type: 'abort' })
  }

  /**
   * Terminate the worker (call on app quit).
   */
  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
    }
  }
}

export const agentWorker = new AgentWorkerManager()

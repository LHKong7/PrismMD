/**
 * Agent Worker Pool — manages multiple worker_threads for concurrent agent operations.
 *
 * Maintains a pool of up to N workers. When all workers are busy, incoming
 * requests are queued and dispatched as workers become available (FIFO).
 * This allows InsightGraph extraction, Horse Mode, and Agent Chat to run
 * concurrently without blocking each other.
 */
import { Worker } from 'worker_threads'
import * as path from 'path'
import { app } from 'electron'
import { callTool as callMcpTool } from './mcpService'
import { traceEvent } from './agentTrace'

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
  toolDefs?: ToolDef[]
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

// ─── Pool Types ─────────────────────────────────────────────────────────────

interface PooledWorker {
  id: number
  worker: Worker
  busy: boolean
  taskType: string | null
  pendingResolve: ((value: any) => void) | null
  pendingReject: ((err: Error) => void) | null
  onChunk: ((delta: string) => void) | null
  onProgress: ((progress: { iteration: number; phase: string; qualityScore?: number }) => void) | null
}

interface QueuedTask {
  type: 'stream' | 'chat' | 'run-task' | 'test'
  payload: any
  resolve: (value: any) => void
  reject: (err: Error) => void
  onChunk?: (delta: string) => void
  onProgress?: (progress: { iteration: number; phase: string; qualityScore?: number }) => void
}

// ─── Worker Pool ────────────────────────────────────────────────────────────

const MAX_WORKERS = 3

class AgentWorkerPool {
  private pool: PooledWorker[] = []
  private queue: QueuedTask[] = []
  private nextId = 0

  private getWorkerPath(): string {
    return path.join(__dirname, 'agentWorker.js')
  }

  private spawnWorker(): PooledWorker {
    const id = this.nextId++
    const worker = new Worker(this.getWorkerPath())

    const pw: PooledWorker = {
      id,
      worker,
      busy: false,
      taskType: null,
      pendingResolve: null,
      pendingReject: null,
      onChunk: null,
      onProgress: null,
    }

    worker.on('message', (msg: { type: string; [key: string]: any }) => {
      switch (msg.type) {
        case 'chunk':
          pw.onChunk?.(msg.delta)
          break
        case 'progress':
          pw.onProgress?.({ iteration: msg.iteration, phase: msg.phase, qualityScore: msg.qualityScore })
          break
        case 'result':
          pw.pendingResolve?.(msg)
          this.releaseWorker(pw)
          break
        case 'error':
          pw.pendingReject?.(new Error(msg.message))
          this.releaseWorker(pw)
          break
        case 'tool-call-request':
          void this.handleToolCallRequest(pw, msg.id, msg.name, msg.args)
          break
      }
    })

    worker.on('error', (err) => {
      pw.pendingReject?.(err)
      this.removeWorker(pw)
      this.drainQueue()
    })

    worker.on('exit', (code) => {
      // Always reject pending tasks on exit — even clean exit (code 0)
      // mid-task means something went wrong
      if (pw.pendingReject) {
        pw.pendingReject(new Error(`Agent worker exited unexpectedly (code ${code})`))
      }
      this.removeWorker(pw)
      this.drainQueue()
    })

    this.pool.push(pw)
    return pw
  }

  private releaseWorker(pw: PooledWorker) {
    pw.busy = false
    pw.taskType = null
    pw.pendingResolve = null
    pw.pendingReject = null
    pw.onChunk = null
    pw.onProgress = null
    this.drainQueue()
  }

  private removeWorker(pw: PooledWorker) {
    const idx = this.pool.indexOf(pw)
    if (idx >= 0) this.pool.splice(idx, 1)
    pw.busy = false
    pw.pendingResolve = null
    pw.pendingReject = null
    pw.onChunk = null
    pw.onProgress = null
  }

  private acquireWorker(): PooledWorker | null {
    // Try to find a free worker
    const free = this.pool.find((pw) => !pw.busy)
    if (free) return free
    // Spawn a new one if under limit
    if (this.pool.length < MAX_WORKERS) return this.spawnWorker()
    // All busy, no room to spawn
    return null
  }

  private drainQueue() {
    while (this.queue.length > 0) {
      let pw: PooledWorker | null
      try {
        pw = this.acquireWorker()
      } catch {
        // spawnWorker() failed — stop draining, tasks stay queued
        break
      }
      if (!pw) break
      const task = this.queue.shift()!
      this.dispatch(pw, task)
    }
  }

  private dispatch(pw: PooledWorker, task: QueuedTask) {
    pw.busy = true
    pw.taskType = task.type
    pw.pendingResolve = task.resolve
    pw.pendingReject = task.reject
    pw.onChunk = task.onChunk ?? null
    pw.onProgress = task.onProgress ?? null
    pw.worker.postMessage({ type: task.type, ...task.payload })
  }

  private async handleToolCallRequest(pw: PooledWorker, id: string, toolName: string, args: Record<string, any>) {
    const sep = toolName.indexOf('__')
    const serverId = sep > 0 ? toolName.slice(0, sep) : toolName
    const actualName = sep > 0 ? toolName.slice(sep + 2) : toolName

    const startMs = Date.now()
    let result: string
    try {
      const output = await callMcpTool(serverId, actualName, args)
      result = typeof output === 'string' ? output : JSON.stringify(output)
    } catch (err) {
      result = `Error: ${err instanceof Error ? err.message : String(err)}`
    }

    traceEvent(
      'tool-call',
      `${serverId} → ${actualName}`,
      {
        tool: toolName,
        server: serverId,
        args,
        result: result.length > 2000 ? `${result.slice(0, 2000)}…` : result,
      },
      Date.now() - startMs,
    )

    pw.worker.postMessage({ type: 'tool-result', id, result })
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Stream a chat message. Calls onChunkCb for each text delta.
   * If all workers are busy, the request is queued.
   */
  async stream(
    config: StreamConfig,
    onChunkCb: (delta: string) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const task: QueuedTask = {
        type: 'stream',
        payload: config,
        resolve: () => resolve(),
        reject,
        onChunk: onChunkCb,
      }
      const pw = this.acquireWorker()
      if (pw) {
        this.dispatch(pw, task)
      } else {
        this.queue.push(task)
      }
    })
  }

  /**
   * Non-streaming chat call. Returns the full reply.
   */
  async chat(config: ChatConfig): Promise<ChatResult> {
    return new Promise<ChatResult>((resolve, reject) => {
      const task: QueuedTask = {
        type: 'chat',
        payload: config,
        resolve: (msg) => resolve({ reply: msg.reply, hadToolCalls: msg.hadToolCalls, usage: msg.usage }),
        reject,
      }
      const pw = this.acquireWorker()
      if (pw) {
        this.dispatch(pw, task)
      } else {
        this.queue.push(task)
      }
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
    return new Promise<RunTaskResult>((resolve, reject) => {
      const task: QueuedTask = {
        type: 'run-task',
        payload: config,
        resolve: (msg) => resolve({ result: msg.result, iterations: msg.iterations, qualityScore: msg.qualityScore, thresholdMet: msg.thresholdMet }),
        reject,
        onProgress: onProgressCb,
      }
      const pw = this.acquireWorker()
      if (pw) {
        this.dispatch(pw, task)
      } else {
        this.queue.push(task)
      }
    })
  }

  /**
   * Quick connectivity test. Returns true if the provider responds.
   */
  async test(provider: ProviderConfig): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const task: QueuedTask = {
        type: 'test',
        payload: { provider },
        resolve: (msg) => resolve(!!msg.success),
        reject: () => resolve(false),
      }
      const pw = this.acquireWorker()
      if (pw) {
        this.dispatch(pw, task)
      } else {
        this.queue.push(task)
      }
    })
  }

  /**
   * Abort the currently streaming operation (targets the worker running a stream task).
   */
  abort(): void {
    // Abort any busy worker running a stream or autonomous task (Horse Mode)
    const target = this.pool.find(
      (pw) => pw.busy && (pw.taskType === 'stream' || pw.taskType === 'run-task'),
    )
    if (target) {
      target.worker.postMessage({ type: 'abort' })
    }
  }

  /**
   * Terminate all workers (call on app quit).
   */
  async shutdown(): Promise<void> {
    // Reject all queued tasks
    for (const task of this.queue) {
      task.reject(new Error('Worker pool shutting down'))
    }
    this.queue = []
    // Terminate all workers
    await Promise.all(this.pool.map((pw) => pw.worker.terminate()))
    this.pool = []
  }
}

export const agentWorker = new AgentWorkerPool()

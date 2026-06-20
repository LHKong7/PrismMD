/**
 * Agent Trace — dev-only structured tracing of the full LLM call chain.
 *
 * Lives in its own module (rather than inside aiService) so both the
 * request/response layer (aiService) and the per-tool-call layer
 * (agentWorkerManager) can emit trace events without a circular import.
 *
 * Trace events are forwarded to the renderer over the `agent:trace` IPC
 * channel and surfaced in the Developer panel (Settings → Agent → Developer).
 * Disabled entirely in packaged builds.
 */
import { app, BrowserWindow } from 'electron'

export type TraceType =
  | 'request'
  | 'system-prompt'
  | 'messages'
  | 'tools'
  | 'response'
  | 'tool-call'
  | 'error'

let traceWindow: BrowserWindow | null = null

export function setTraceWindow(win: BrowserWindow) {
  traceWindow = win
}

export function traceEvent(type: TraceType, label: string, data: unknown, durationMs?: number) {
  if (app.isPackaged) return
  if (!traceWindow || traceWindow.isDestroyed()) return
  traceWindow.webContents.send('agent:trace', {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    label,
    data,
    durationMs,
  })
}

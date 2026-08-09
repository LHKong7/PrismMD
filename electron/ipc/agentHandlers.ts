import { ipcMain } from 'electron'
import { sendMessage, sendOneShot, runTask, stopGeneration, testConnection, setTraceWindow } from '../services/aiService'
import { saveMemory, getMemoryContext, clearMemory, extractSummaryFromConversation } from '../services/memoryService'
import {
  createSession,
  restoreSession,
  listSessions,
  deleteSession,
  saveSessionHistory,
  getSessionHistory,
  getSessionDir,
} from '../services/sessionService'
import {
  getDocSummary,
  setDocSummary,
  clearDocSummaries,
  type DocSummary,
} from '../services/docSummaryService'
import { listModels, type ProviderName } from '../agent/pi/models'
import { getMainWindow } from '../main'

export function registerAgentHandlers() {
  // Wire up the trace window so aiService can emit trace events
  const win = getMainWindow()
  if (win) setTraceWindow(win)

  ipcMain.handle('agent:send-message', async (_event, request) => {
    const win = getMainWindow()
    if (!win) throw new Error('Main window is not available')
    setTraceWindow(win)
    return sendMessage(win, request)
  })

  ipcMain.on('agent:stop', () => {
    stopGeneration()
  })

  ipcMain.handle('agent:test-connection', async (_event, provider: string, apiKey: string, baseUrl?: string, model?: string) => {
    return testConnection(provider, apiKey, baseUrl, model)
  })

  /**
   * 某个 provider 的可选模型 —— 读 pi-ai 自带的目录，不需要 API key，
   * 也不发网络请求。ollama / custom 返回空数组（模型名由用户自己填）。
   */
  ipcMain.handle('agent:list-models', (_event, provider: string) => {
    try {
      return listModels(provider as ProviderName)
    } catch {
      // 目录读不出来不该让设置界面挂掉 —— 渲染层会退回内置的兜底列表。
      return []
    }
  })

  ipcMain.handle(
    'agent:one-shot',
    async (
      _event,
      request: { prompt: string; systemPrompt?: string; jsonSchema?: Record<string, unknown> },
    ) => {
      try {
        const result = await sendOneShot(request)
        return { ok: true as const, result }
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // Memory handlers
  ipcMain.handle('memory:save', async (_event, filePath: string, summary: string, topics: string[]) => {
    return saveMemory(filePath, summary, topics)
  })

  ipcMain.handle('memory:get-context', async (_event, filePath?: string, query?: string) => {
    return getMemoryContext(filePath, query)
  })

  ipcMain.handle('memory:extract-summary', (_event, messages: Array<{ role: string; content: string }>) => {
    return extractSummaryFromConversation(messages)
  })

  ipcMain.handle('memory:clear', async () => {
    return clearMemory()
  })

  ipcMain.handle(
    'agent:run-task',
    async (
      _event,
      request: {
        task: string
        systemPrompt?: string
        qualityThreshold?: number
        maxIterations?: number
      },
    ) => {
      const win = getMainWindow()
      if (!win) throw new Error('Main window is not available')
      try {
        const result = await runTask(win, request)
        return { ok: true as const, result }
      } catch (err) {
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // Session handlers
  ipcMain.handle('session:get-dir', () => {
    return getSessionDir()
  })

  ipcMain.handle('session:create', async () => {
    return createSession()
  })

  ipcMain.handle('session:restore', async (_event, sessionId: string) => {
    return restoreSession(sessionId)
  })

  ipcMain.handle('session:list', async (_event, limit?: number) => {
    return listSessions(limit)
  })

  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    return deleteSession(sessionId)
  })

  ipcMain.handle(
    'session:save-history',
    async (
      _event,
      sessionId: string,
      messages: Array<{ role: string; content: string }>,
      metadata?: { source?: 'chat' | 'horse-mode' },
    ) => {
      return saveSessionHistory(sessionId, messages, metadata)
    },
  )

  ipcMain.handle('session:get-history', async (_event, sessionId: string) => {
    return getSessionHistory(sessionId)
  })

  // Per-document TL;DR cache
  ipcMain.handle('doc-summary:get', async (_event, filePath: string) => {
    return getDocSummary(filePath)
  })

  ipcMain.handle('doc-summary:set', async (_event, filePath: string, summary: DocSummary) => {
    return setDocSummary(filePath, summary)
  })

  ipcMain.handle('doc-summary:clear', async () => {
    return clearDocSummaries()
  })
}

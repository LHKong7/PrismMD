import { ipcMain } from 'electron'
import { sendMessage, sendOneShot, stopGeneration, testConnection } from '../services/aiService'
import { saveMemory, getMemoryContext, clearMemory, extractSummaryFromConversation } from '../services/memoryService'
import { getMainWindow } from '../main'

export function registerAgentHandlers() {
  ipcMain.handle('agent:send-message', async (_event, request) => {
    const win = getMainWindow()
    if (!win) throw new Error('Main window is not available')
    return sendMessage(win, request)
  })

  ipcMain.on('agent:stop', () => {
    stopGeneration()
  })

  ipcMain.handle('agent:test-connection', async (_event, provider: string, apiKey: string, baseUrl?: string) => {
    return testConnection(provider, apiKey, baseUrl)
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
}

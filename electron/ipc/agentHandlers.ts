import { BrowserWindow, ipcMain } from 'electron'
import { sendMessage, stopGeneration, testConnection } from '../services/aiService'
import { indexWorkspace, retrieveContext, getIndexedDocumentCount, clearIndex } from '../services/ragService'
import { saveMemory, getMemoryContext, clearMemory, extractSummaryFromConversation } from '../services/memoryService'

export function registerAgentHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('agent:send-message', async (_event, request) => {
    return sendMessage(mainWindow, request)
  })

  ipcMain.on('agent:stop', () => {
    stopGeneration()
  })

  ipcMain.handle('agent:test-connection', async (_event, provider: string, apiKey: string, baseUrl?: string) => {
    return testConnection(provider, apiKey, baseUrl)
  })

  // RAG handlers
  ipcMain.handle('rag:index-workspace', async (_event, workspacePath: string) => {
    return indexWorkspace(workspacePath)
  })

  ipcMain.handle('rag:retrieve', async (_event, query: string, topK?: number, excludeFile?: string) => {
    return retrieveContext(query, topK, excludeFile)
  })

  ipcMain.handle('rag:get-doc-count', () => {
    return getIndexedDocumentCount()
  })

  ipcMain.handle('rag:clear', () => {
    clearIndex()
  })

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

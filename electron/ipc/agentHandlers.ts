import { BrowserWindow, ipcMain } from 'electron'
import { sendMessage, stopGeneration, testConnection } from '../services/aiService'

export function registerAgentHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('agent:send-message', async (_event, request) => {
    return sendMessage(mainWindow, request)
  })

  ipcMain.on('agent:stop', () => {
    stopGeneration()
  })

  ipcMain.handle('agent:test-connection', async (_event, provider: string, apiKey: string) => {
    return testConnection(provider, apiKey)
  })
}

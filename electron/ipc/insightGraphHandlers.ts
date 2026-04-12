import { ipcMain } from 'electron'
import {
  testNeo4jConnection,
  ingestDocument,
  graphQuery,
  listReports,
  createSession,
  shutdown,
} from '../services/insightGraphService'
import { getMainWindow } from '../main'

export function registerInsightGraphHandlers() {
  ipcMain.handle('insightgraph:test-neo4j', async (_e, uri: string, user: string, password: string) => {
    return testNeo4jConnection(uri, user, password)
  })

  ipcMain.handle('insightgraph:ingest', async (_e, filePath: string) => {
    const win = getMainWindow()
    try {
      const result = await ingestDocument(filePath, win)
      return { ok: true as const, result }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:query', async (_e, question: string, sessionId?: string) => {
    try {
      const result = await graphQuery(question, sessionId)
      return { ok: true as const, result }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:list-reports', async () => {
    try {
      const reports = await listReports()
      return { ok: true as const, reports }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:create-session', async () => {
    try {
      const id = await createSession()
      return { ok: true as const, sessionId: id }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('insightgraph:shutdown', async () => {
    await shutdown()
  })
}

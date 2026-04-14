import { ipcMain } from 'electron'
import {
  statusAll,
  listTools,
  callTool,
  restartAll,
  stop,
} from '../services/mcpService'

export function registerMcpHandlers() {
  ipcMain.handle('mcp:status-all', async () => {
    try {
      return { ok: true as const, servers: await statusAll() }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle('mcp:list-tools', async (_e, serverId: string) => {
    try {
      return { ok: true as const, tools: await listTools(serverId) }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle(
    'mcp:call-tool',
    async (_e, serverId: string, toolName: string, args: Record<string, unknown>) => {
      try {
        return { ok: true as const, result: await callTool(serverId, toolName, args) }
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  // Apply any settings changes by restarting the pool. Pool-start and
  // tool-discovery are idempotent so this is safe to invoke after every
  // settings save.
  ipcMain.handle('mcp:restart', async () => {
    try {
      await restartAll()
      return { ok: true as const }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle('mcp:stop', async (_e, serverId: string) => {
    try {
      await stop(serverId)
      return { ok: true as const }
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

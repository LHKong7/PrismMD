import { ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { getMcpServerSettings, saveMcpServerSettings } from '../services/settingsStore'
import {
  startMcpServer,
  stopMcpServer,
  getMcpServerStatus,
  ensureToken,
  type McpServerStatus,
} from '../services/mcpServerService'

/**
 * IPC for the outbound MCP *server* (exposing notes to external agents).
 * Distinct from `mcpHandlers` (the inbound client that consumes other servers).
 * Every mutation reconciles the running listener with the persisted `enabled`
 * flag so the UI toggle is the single source of truth.
 */

interface McpServerView {
  enabled: boolean
  port: number
  token: string
  status: McpServerStatus
}

function view(): McpServerView {
  const cfg = getMcpServerSettings()
  return { enabled: cfg.enabled, port: cfg.port, token: cfg.token, status: getMcpServerStatus() }
}

/** Bring the live listener in line with the persisted `enabled` flag. */
async function reconcile(): Promise<string | undefined> {
  if (getMcpServerSettings().enabled) {
    const res = await startMcpServer()
    return res.ok ? undefined : res.error
  }
  await stopMcpServer()
  return undefined
}

export function registerMcpServerHandlers() {
  ipcMain.handle('mcpserver:get-config', () => ({ ok: true as const, ...view() }))

  ipcMain.handle('mcpserver:set-config', async (_e, patch: { enabled?: boolean; port?: number }) => {
    const clean: Partial<{ enabled: boolean; port: number }> = {}
    if (typeof patch?.enabled === 'boolean') clean.enabled = patch.enabled
    if (typeof patch?.port === 'number' && patch.port >= 1024 && patch.port <= 65535) {
      clean.port = Math.floor(patch.port)
    }
    // Mint a token the first time the server is switched on.
    if (clean.enabled) ensureToken()
    saveMcpServerSettings(clean)
    const error = await reconcile()
    return { ok: !error, error, ...view() }
  })

  ipcMain.handle('mcpserver:regenerate-token', async () => {
    saveMcpServerSettings({ token: randomBytes(24).toString('hex') })
    const error = await reconcile()
    return { ok: !error, error, ...view() }
  })

  ipcMain.handle('mcpserver:status', () => ({ ok: true as const, status: getMcpServerStatus() }))
}

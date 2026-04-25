import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { getMcpSettings } from './settingsStore'

/**
 * MCP (Model Context Protocol) client pool. One `Client` instance per
 * configured server; we spawn/shut-down on demand and cache the tool
 * listings so the agent doesn't re-roundtrip for every chat turn.
 *
 * Why a pool instead of one client: each MCP server is a separate
 * subprocess (fetch-server, sql-server, …) with its own stdio pipe.
 * The protocol multiplexes over a single pipe but doesn't multiplex
 * over subprocesses — we need one transport per server.
 */

export interface McpTool {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export interface ServerStatus {
  id: string
  running: boolean
  error?: string
  toolCount: number
}

interface PoolEntry {
  client: Client
  tools: McpTool[]
}

const pool = new Map<string, PoolEntry>()

async function spawnClient(
  id: string,
  config: { command: string; args: string[]; env?: Record<string, string> },
): Promise<PoolEntry> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    // Inherit the parent env by default and layer on the server-specific
    // entries — most servers want PATH for node_modules-bin scripts.
    env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>,
  })
  const client = new Client(
    { name: 'prismmd', version: '0.1.0' },
    { capabilities: {} },
  )
  await client.connect(transport)

  const listing = await client.listTools()
  const tools: McpTool[] = listing.tools.map((t) => ({
    name: t.name,
    description: t.description,
    // The SDK types this as `ToolInputSchema` but it's always a JSON
    // Schema object at the wire level — coerce so callers can treat
    // it uniformly.
    inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
  }))

  return { client, tools }
}

/**
 * Check if a pool entry's subprocess is still alive. The MCP Client
 * wraps a StdioClientTransport that owns a ChildProcess — if that
 * process has exited the entry is stale and should be discarded.
 */
function isAlive(entry: PoolEntry): boolean {
  try {
    // The transport is accessible as a private `_transport` field on the
    // Client. If the SDK shape changes we fall back to "alive" to avoid
    // breaking existing functionality.
    const transport = (entry.client as unknown as { _transport?: StdioClientTransport })._transport
    if (!transport) return true // can't tell — assume alive
    const proc = (transport as unknown as { _process?: { exitCode: number | null } })._process
    if (!proc) return true
    return proc.exitCode === null // null means "still running"
  } catch {
    return true
  }
}

async function ensureStarted(id: string): Promise<PoolEntry | null> {
  const existing = pool.get(id)
  if (existing) {
    if (isAlive(existing)) return existing
    // Subprocess has exited — discard stale entry and re-spawn.
    console.warn(`[mcp:${id}] subprocess exited, restarting…`)
    pool.delete(id)
  }

  const settings = getMcpSettings()
  const config = settings.servers[id]
  if (!config || config.enabled === false) return null

  try {
    const entry = await spawnClient(id, config)
    pool.set(id, entry)
    return entry
  } catch (err) {
    console.error(`[mcp:${id}] failed to start:`, err)
    return null
  }
}

/** Start every enabled server configured in settings. */
export async function startAll(): Promise<void> {
  const settings = getMcpSettings()
  if (!settings.enabled) return
  for (const [id, config] of Object.entries(settings.servers)) {
    if (config.enabled === false) continue
    await ensureStarted(id)
  }
}

/**
 * Stop a single server. Closes the transport so the subprocess exits.
 * Idempotent — stopping a server that isn't running is a no-op.
 */
export async function stop(id: string): Promise<void> {
  const entry = pool.get(id)
  if (!entry) return
  pool.delete(id)
  try {
    await entry.client.close()
  } catch (err) {
    console.warn(`[mcp:${id}] close failed:`, err)
  }
}

export async function shutdownAll(): Promise<void> {
  const ids = Array.from(pool.keys())
  await Promise.all(ids.map(stop))
}

export async function listTools(id: string): Promise<McpTool[]> {
  const entry = await ensureStarted(id)
  return entry?.tools ?? []
}

/**
 * Discover tools across *every* enabled server. Returns a flat list
 * pre-namespaced as `<serverId>__<toolName>` so callers can register
 * them with the agent without worrying about collisions.
 */
export async function discoverAll(): Promise<
  Array<{ serverId: string; tool: McpTool; qualifiedName: string }>
> {
  const settings = getMcpSettings()
  if (!settings.enabled) return []

  const out: Array<{ serverId: string; tool: McpTool; qualifiedName: string }> = []
  for (const id of Object.keys(settings.servers)) {
    const tools = await listTools(id)
    for (const tool of tools) {
      out.push({
        serverId: id,
        tool,
        qualifiedName: `${id}__${tool.name}`,
      })
    }
  }
  return out
}

export async function callTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const attempt = async (retry: boolean): Promise<unknown> => {
    const entry = await ensureStarted(serverId)
    if (!entry) throw new Error(`MCP server "${serverId}" is not running`)

    const settings = getMcpSettings()
    const timeoutMs = settings.toolTimeoutMs

    try {
      const callPromise = entry.client.callTool({ name: toolName, arguments: args })
      const result = await Promise.race([
        callPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`MCP call "${toolName}" timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ])

      if (result && typeof result === 'object' && 'content' in result) {
        const content = (result as { content: Array<{ type: string; text?: string }> }).content
        const textParts = content.filter((b) => b.type === 'text').map((b) => b.text ?? '')
        if (textParts.length === content.length) return textParts.join('\n')
      }
      return result
    } catch (err) {
      // On transport / subprocess errors, discard the stale entry and
      // retry once with a fresh spawn.
      if (retry) {
        console.warn(`[mcp:${serverId}] call failed, retrying with fresh connection…`, err)
        pool.delete(serverId)
        return attempt(false)
      }
      throw err
    }
  }

  return attempt(true)
}

/** Snapshot for the settings UI. */
export async function statusAll(): Promise<ServerStatus[]> {
  const settings = getMcpSettings()
  return Object.keys(settings.servers).map((id) => {
    const entry = pool.get(id)
    return {
      id,
      running: !!entry,
      toolCount: entry?.tools.length ?? 0,
    }
  })
}

/**
 * Restart the whole pool. Useful after a settings change — simpler
 * than reconciling add/remove/update piecewise.
 */
export async function restartAll(): Promise<void> {
  await shutdownAll()
  await startAll()
}

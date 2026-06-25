/**
 * mcpServerService — exposes the user's notes to external agents over a
 * localhost-only Streamable-HTTP MCP server. This is the inverse of
 * `mcpService` (which *consumes* external MCP servers): here PrismMD *is* the
 * server, so tools like Claude Code / Claude Desktop can read the workspace.
 *
 * Read-only by design: `search_notes` / `get_note` / `list_notes`, backed
 * directly by `documentService`. The HTTP listener binds to 127.0.0.1 only and
 * every request must carry the bearer `token` from settings; DNS-rebinding
 * protection is on. Lifecycle is start/stop, driven by settings + the Settings
 * UI. Sessions follow the MCP stateful pattern (one transport per session id).
 */

import http from 'node:http'
import { randomUUID, randomBytes } from 'node:crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js'
import { searchPages, getPage, getPageTree, getPageCount, type PageTreeNode } from './documentService'
import { getMcpServerSettings, saveMcpServerSettings } from './settingsStore'
import { isRagReady, semanticSearch } from './ragService'

const SERVER_NAME = 'prismmd'
const SERVER_VERSION = '1.0.0'

export interface McpServerStatus {
  running: boolean
  port: number
  /** Connection URL for clients, when running. */
  url: string | null
  /** Number of live MCP sessions. */
  sessions: number
}

// ── Tool definitions (read-only) ────────────────────────────────────────────

const TOOL_DEFS = [
  {
    name: 'search_notes',
    description:
      "Search the user's PrismMD notes and return matching notes with id, title and a short snippet. Uses semantic (embedding) search when the user has enabled it, otherwise keyword search; either way, pass an id to get_note to read the full document.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text matched against note title and content.' },
        limit: { type: 'number', description: 'Max results to return (1–50). Default 10.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_note',
    description:
      'Read the full Markdown content of one note by its id (obtain ids from search_notes or list_notes).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The note id.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_notes',
    description:
      "List the user's note tree (folders and documents) as an indented outline with ids. Use it to browse the workspace before reading a specific note.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

// ── Tool implementations ────────────────────────────────────────────────────

/** A short, query-centred excerpt of a note's body for search results. */
function snippet(content: string, query: string, len = 160): string {
  const text = (content || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return text.slice(0, len) + (text.length > len ? '…' : '')
  const start = Math.max(0, i - 40)
  const end = Math.min(text.length, i + query.length + 120)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

async function toolSearchNotes(args: Record<string, unknown>): Promise<string> {
  const query = String(args?.query ?? '').trim()
  if (!query) throw new Error('search_notes requires a non-empty "query".')
  const limit = Math.min(50, Math.max(1, Number(args?.limit) || 10))

  // Prefer semantic search when the RAG index is ready; fall back to keyword.
  if (isRagReady()) {
    try {
      const hits = await semanticSearch(query, limit)
      if (hits.length) {
        const lines = hits.map(
          (h) =>
            `- [${h.pageId}] ${h.title}  (relevance ${(h.score * 100).toFixed(0)}%)` +
            (h.snippet ? `\n    ${h.snippet}` : ''),
        )
        return `${hits.length} note(s) semantically matching ${JSON.stringify(query)}:\n` + lines.join('\n')
      }
    } catch {
      // embedding endpoint hiccup — degrade to keyword search rather than erroring.
    }
  }

  const results = searchPages(query).slice(0, limit)
  if (!results.length) return `No notes match ${JSON.stringify(query)}.`
  const lines = results.map((r) => {
    const page = getPage(r.id)
    const snip = page ? snippet(page.content, query) : ''
    return `- [${r.id}] ${r.title}` + (snip ? `\n    ${snip}` : '')
  })
  return `${results.length} note(s) matching ${JSON.stringify(query)}:\n` + lines.join('\n')
}

function toolGetNote(args: Record<string, unknown>): string {
  const id = String(args?.id ?? '').trim()
  if (!id) throw new Error('get_note requires an "id".')
  const page = getPage(id)
  if (!page) throw new Error(`No note found with id ${JSON.stringify(id)}.`)
  if (page.isFolder) return `"${page.title}" is a folder, not a document.`
  return `# ${page.title}\n\n` + (page.content || '(empty note)')
}

function outline(nodes: PageTreeNode[], depth = 0): string[] {
  const lines: string[] = []
  for (const n of nodes) {
    const indent = '  '.repeat(depth)
    const kind = n.isFolder ? '📁' : '📄'
    lines.push(`${indent}${kind} [${n.id}] ${n.title}`)
    if (n.children?.length) lines.push(...outline(n.children, depth + 1))
  }
  return lines
}

function toolListNotes(): string {
  const tree = getPageTree()
  if (!tree.length) return 'The workspace has no notes yet.'
  return `Workspace (${getPageCount()} notes):\n` + outline(tree).join('\n')
}

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    let text: string
    if (name === 'search_notes') text = await toolSearchNotes(args)
    else if (name === 'get_note') text = toolGetNote(args)
    else if (name === 'list_notes') text = toolListNotes()
    else throw new Error(`Unknown tool: ${name}`)
    return { content: [{ type: 'text', text }] }
  } catch (err) {
    return { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true }
  }
}

function buildMcpServer(): Server {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    callTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>),
  )
  return server
}

// ── HTTP transport + session lifecycle ──────────────────────────────────────

const transports: Record<string, StreamableHTTPServerTransport> = {}
let httpServer: http.Server | null = null
let activePort = 0

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) return resolve(undefined)
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse, token: string): Promise<void> {
  const path = (req.url ?? '').split('?')[0]
  if (path !== '/mcp') {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  // Bearer-token auth — required on every request (token is always set while running).
  const authHeader = req.headers['authorization']
  const provided =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-mcp-token'] as string | undefined)
  if (!token || provided !== token) {
    sendJson(res, 401, { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    return
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined

  try {
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      let transport: StreamableHTTPServerTransport
      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId]
      } else if (!sessionId && isInitializeRequest(body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: true,
          allowedHosts: ['127.0.0.1', `127.0.0.1:${activePort}`, 'localhost', `localhost:${activePort}`],
          onsessioninitialized: (sid) => {
            transports[sid] = transport
          },
        })
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId]
        }
        await buildMcpServer().connect(transport)
      } else {
        sendJson(res, 400, { jsonrpc: '2.0', error: { code: -32000, message: 'No valid session' }, id: null })
        return
      }
      await transport.handleRequest(req, res, body)
    } else if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionId || !transports[sessionId]) {
        sendJson(res, 400, { error: 'Missing or invalid session' })
        return
      }
      await transports[sessionId].handleRequest(req, res)
    } else {
      res.writeHead(405).end()
    }
  } catch (err) {
    if (!res.headersSent) sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}

// ── Public lifecycle API ─────────────────────────────────────────────────────

/** Return the configured bearer token, generating + persisting one if absent. */
export function ensureToken(): string {
  const cfg = getMcpServerSettings()
  if (cfg.token) return cfg.token
  const token = randomBytes(24).toString('hex')
  saveMcpServerSettings({ token })
  return token
}

export async function startMcpServer(): Promise<
  { ok: true; status: McpServerStatus } | { ok: false; error: string }
> {
  if (httpServer) await stopMcpServer()
  const cfg = getMcpServerSettings()
  const token = ensureToken()
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      void handleHttp(req, res, token)
    })
    srv.once('error', (err: NodeJS.ErrnoException) => {
      httpServer = null
      const msg = err.code === 'EADDRINUSE' ? `Port ${cfg.port} is already in use.` : err.message
      resolve({ ok: false, error: msg })
    })
    srv.listen(cfg.port, '127.0.0.1', () => {
      httpServer = srv
      activePort = cfg.port
      resolve({ ok: true, status: getMcpServerStatus() })
    })
  })
}

export async function stopMcpServer(): Promise<void> {
  for (const sid of Object.keys(transports)) {
    try {
      await transports[sid].close()
    } catch {
      /* ignore */
    }
    delete transports[sid]
  }
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()))
    httpServer = null
  }
  activePort = 0
}

export function getMcpServerStatus(): McpServerStatus {
  const cfg = getMcpServerSettings()
  const running = !!httpServer
  const port = running ? activePort : cfg.port
  return {
    running,
    port,
    url: running ? `http://127.0.0.1:${activePort}/mcp` : null,
    sessions: Object.keys(transports).length,
  }
}

/** Start the server on launch if the user left it enabled. */
export async function initMcpServerFromSettings(): Promise<void> {
  if (getMcpServerSettings().enabled) {
    const res = await startMcpServer()
    if (!res.ok) console.error('[mcpServer] failed to start:', res.error)
  }
}

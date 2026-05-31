/**
 * Session Service — persistent chat session management.
 *
 * Wraps the agent module's SessionManager to provide file-based
 * persistence of conversation history in the Electron userData directory.
 * Sessions are stored as individual JSON files in `{userData}/sessions/`.
 */
import * as path from 'path'
import { app } from 'electron'
import { SessionManager, Session } from '../agent/sessionCore'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string
  updatedAt: number
  turns: number
  state: string
  preview: string
  source: 'chat' | 'horse-mode'
}

export interface SessionHistory {
  id: string
  messages: Array<{ role: string; content: string }>
}

// ─── Singleton SessionManager ──────────────────────────────────────────────

const SESSION_DIR = path.join(app.getPath('userData'), 'sessions')

const manager = new SessionManager({ storageDir: SESSION_DIR })

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Return the directory where session files are stored.
 */
export function getSessionDir(): string {
  return SESSION_DIR
}

/**
 * Create a new session. Returns the session ID.
 */
export async function createSession(): Promise<string> {
  const session = await manager.createSession()
  return session.id
}

/**
 * Restore a session by ID. Returns the chat history, or null if not found.
 */
export async function restoreSession(sessionId: string): Promise<SessionHistory | null> {
  const session = await manager.restoreSession(sessionId)
  if (!session) return null
  return {
    id: session.id,
    messages: session.history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: String(m.role), content: String(m.content ?? '') })),
  }
}

/**
 * List all sessions, sorted by most recently updated. Returns summaries.
 */
export async function listSessions(limit: number = 50): Promise<SessionSummary[]> {
  const summaries = await manager.listSessionsSummary(limit)
  const results: SessionSummary[] = []
  for (const s of summaries) {
    const state = String(s.state ?? 'active')
    if (state === 'archived') continue
    // Try to get the preview and source from the session's context
    let preview = ''
    let source: 'chat' | 'horse-mode' = 'chat'
    try {
      const session = await manager.restoreSession(String(s.id))
      if (session) {
        preview = String(session.context?.firstMessage ?? '')
        if (!preview) {
          const firstUser = session.history.find((m) => m.role === 'user')
          if (firstUser) preview = String(firstUser.content ?? '').slice(0, 80)
        }
        if (session.context?.source === 'horse-mode') source = 'horse-mode'
      }
    } catch {
      // Best-effort
    }
    results.push({
      id: String(s.id),
      updatedAt: Number(s.updated_at ?? 0),
      turns: Number(s.turns ?? 0),
      state,
      preview,
      source,
    })
  }
  return results
}

/**
 * Archive (soft-delete) a session by ID. Returns true if found and archived.
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  return manager.archiveSession(sessionId)
}

/**
 * Save the current chat history to a session. Creates the session if it
 * doesn't exist, otherwise updates its history.
 */
export async function saveSessionHistory(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  metadata?: { source?: 'chat' | 'horse-mode' },
): Promise<void> {
  let session = await manager.restoreSession(sessionId)
  if (!session) {
    session = new Session({ id: sessionId })
  }
  session.history = messages.map((m) => ({ role: m.role, content: m.content }))
  session.updatedAt = Date.now() / 1000
  // Store first user message as preview for the session list
  if (!session.context.firstMessage) {
    const firstUser = messages.find((m) => m.role === 'user')
    if (firstUser) {
      session.context.firstMessage = firstUser.content.slice(0, 80)
    }
  }
  // Store source tag (chat vs horse-mode)
  if (metadata?.source) {
    session.context.source = metadata.source
  }
  await manager.saveSession(session)
}

/**
 * Get the raw history for a session (all roles, including tool messages).
 */
export async function getSessionHistory(
  sessionId: string,
): Promise<Array<{ role: string; content: string }> | null> {
  const session = await manager.restoreSession(sessionId)
  if (!session) return null
  return session.history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: String(m.role), content: String(m.content ?? '') }))
}

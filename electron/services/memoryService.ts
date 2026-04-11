import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

/**
 * Long-term memory service for storing conversation summaries
 * and user preferences per document.
 */

interface MemoryEntry {
  id: string
  filePath: string
  summary: string
  topics: string[]
  timestamp: string
}

interface MemoryStore {
  entries: MemoryEntry[]
  globalPreferences: string[]
}

function getMemoryDir(): string {
  return path.join(app.getPath('userData'), 'memory')
}

function getMemoryFile(): string {
  return path.join(getMemoryDir(), 'memory.json')
}

async function loadMemoryStore(): Promise<MemoryStore> {
  try {
    const data = await fs.readFile(getMemoryFile(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return { entries: [], globalPreferences: [] }
  }
}

async function saveMemoryStore(store: MemoryStore): Promise<void> {
  const dir = getMemoryDir()
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(getMemoryFile(), JSON.stringify(store, null, 2), 'utf-8')
}

/**
 * Save a conversation summary for a specific document
 */
export async function saveMemory(filePath: string, summary: string, topics: string[]): Promise<void> {
  const store = await loadMemoryStore()

  const entry: MemoryEntry = {
    id: crypto.randomUUID(),
    filePath,
    summary,
    topics,
    timestamp: new Date().toISOString(),
  }

  store.entries.push(entry)

  // Keep only the last 100 entries
  if (store.entries.length > 100) {
    store.entries = store.entries.slice(-100)
  }

  await saveMemoryStore(store)
}

/**
 * Retrieve relevant memory context for a document or query
 */
export async function getMemoryContext(filePath?: string, query?: string): Promise<string> {
  const store = await loadMemoryStore()

  if (store.entries.length === 0) return ''

  let relevant = store.entries

  // Filter by file path if provided
  if (filePath) {
    const fileEntries = relevant.filter((e) => e.filePath === filePath)
    const otherEntries = relevant.filter((e) => e.filePath !== filePath)

    // Prioritize entries from the same file, then add recent general entries
    relevant = [...fileEntries.slice(-5), ...otherEntries.slice(-3)]
  } else {
    relevant = relevant.slice(-8)
  }

  // Filter by query relevance if provided
  if (query) {
    const queryLower = query.toLowerCase()
    const scored = relevant.map((entry) => {
      let score = 0
      if (entry.summary.toLowerCase().includes(queryLower)) score += 2
      for (const topic of entry.topics) {
        if (queryLower.includes(topic.toLowerCase())) score += 1
      }
      return { entry, score }
    })
    relevant = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.entry)
  }

  if (relevant.length === 0) return ''

  return relevant
    .map((e) => `[${new Date(e.timestamp).toLocaleDateString()}] ${e.summary}`)
    .join('\n')
}

/**
 * Extract a brief summary from a conversation for memory storage
 */
export function extractSummaryFromConversation(
  messages: Array<{ role: string; content: string }>
): { summary: string; topics: string[] } {
  const userMessages = messages.filter((m) => m.role === 'user').map((m) => m.content)
  const assistantMessages = messages.filter((m) => m.role === 'assistant').map((m) => m.content)

  // Simple summary: combine first user question and last assistant answer
  const summary = userMessages.length > 0
    ? `Q: ${userMessages[0].slice(0, 100)}${userMessages[0].length > 100 ? '...' : ''} | A: ${(assistantMessages[assistantMessages.length - 1] ?? '').slice(0, 150)}${(assistantMessages[assistantMessages.length - 1] ?? '').length > 150 ? '...' : ''}`
    : ''

  // Extract topics from user messages
  const allText = userMessages.join(' ').toLowerCase()
  const words = allText.split(/\s+/).filter((w) => w.length > 3)
  const wordFreq = new Map<string, number>()
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1)
  }
  const topics = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  return { summary, topics }
}

export async function clearMemory(): Promise<void> {
  await saveMemoryStore({ entries: [], globalPreferences: [] })
}

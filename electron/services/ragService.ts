import fs from 'fs/promises'
import path from 'path'

/**
 * Simple text-based RAG service for local document indexing.
 * Indexes all .md files in the workspace, splits them into chunks,
 * and provides keyword-based retrieval for relevant context.
 */

interface DocumentChunk {
  filePath: string
  fileName: string
  content: string
  headings: string[]
}

let indexedChunks: DocumentChunk[] = []

const MD_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])
const CHUNK_SIZE = 500 // characters per chunk
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vscode', '.idea'])

async function walkDirectory(dirPath: string): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        files.push(...await walkDirectory(fullPath))
      } else if (MD_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath)
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return files
}

function splitIntoChunks(content: string, filePath: string): DocumentChunk[] {
  const fileName = path.basename(filePath)
  const chunks: DocumentChunk[] = []

  // Extract headings for metadata
  const headingMatches = content.match(/^#{1,6}\s.+$/gm) ?? []
  const headings = headingMatches.map((h) => h.replace(/^#+\s/, ''))

  // Split by paragraphs first, then by size
  const paragraphs = content.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({ filePath, fileName, content: currentChunk.trim(), headings })
      currentChunk = ''
    }
    currentChunk += para + '\n\n'
  }

  if (currentChunk.trim()) {
    chunks.push({ filePath, fileName, content: currentChunk.trim(), headings })
  }

  return chunks
}

/**
 * Index all Markdown files in the workspace directory
 */
export async function indexWorkspace(workspacePath: string): Promise<number> {
  const files = await walkDirectory(workspacePath)
  indexedChunks = []

  for (const filePath of files) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      indexedChunks.push(...splitIntoChunks(content, filePath))
    } catch {
      // Skip unreadable files
    }
  }

  return indexedChunks.length
}

/**
 * Retrieve the most relevant chunks for a given query using keyword matching.
 * Returns the top-k chunks ranked by relevance score.
 */
export function retrieveContext(query: string, topK: number = 5, excludeFile?: string): string {
  if (indexedChunks.length === 0) return ''

  // Tokenize query into keywords
  const queryTokens = query
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 1)

  if (queryTokens.length === 0) return ''

  // Score each chunk by keyword overlap
  const scored = indexedChunks
    .filter((chunk) => !excludeFile || chunk.filePath !== excludeFile)
    .map((chunk) => {
      const chunkLower = chunk.content.toLowerCase()
      let score = 0
      for (const token of queryTokens) {
        // Count occurrences of each query token in the chunk
        const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        const matches = chunkLower.match(regex)
        if (matches) score += matches.length
      }
      // Boost score for heading matches
      for (const heading of chunk.headings) {
        for (const token of queryTokens) {
          if (heading.toLowerCase().includes(token)) score += 3
        }
      }
      return { chunk, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  if (scored.length === 0) return ''

  return scored
    .map((s) => `[From: ${s.chunk.fileName}]\n${s.chunk.content}`)
    .join('\n\n---\n\n')
}

export function getIndexedDocumentCount(): number {
  const uniqueFiles = new Set(indexedChunks.map((c) => c.filePath))
  return uniqueFiles.size
}

export function clearIndex() {
  indexedChunks = []
}

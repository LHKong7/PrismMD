import { create } from 'zustand'
import MiniSearch from 'minisearch'
import { useFileStore } from './fileStore'
import { flattenFiles, fileExt, fileName } from '../lib/fileTree'

// Only text formats indexed v1. PDF/XLSX content extraction would need
// pdfjs getTextContent + xlsx.utils.sheet_to_csv — left as follow-up.
const INDEXABLE_EXT = new Set(['md', 'markdown', 'mdx', 'csv', 'txt'])
const READ_BATCH = 25

export interface SearchHit {
  path: string
  name: string
  /** Short snippet around the first match (best-effort). */
  snippet: string
  score: number
}

interface SearchIndexStore {
  index: MiniSearch | null
  status: 'idle' | 'building' | 'ready' | 'error'
  fileCount: number
  lastBuildKey: string
  error: string | null
  build: () => Promise<void>
  invalidate: () => void
  search: (query: string) => SearchHit[]
}

interface IndexedDoc {
  id: string
  name: string
  path: string
  body: string
}

function computeBuildKey(): string {
  const folders = useFileStore.getState().openFolders
  return folders
    .map((f) => `${f.path}:${flattenFiles(f.tree).length}`)
    .join('|')
}

// Generation token for in-flight build() calls. Bumped on build() start
// and on invalidate(); a completing build only commits if its captured
// generation still matches — otherwise a folder change mid-build would
// silently overwrite the invalidated state with a stale index.
let buildGeneration = 0

function snippetFor(body: string, terms: string[]): string {
  if (!body) return ''
  const lower = body.toLowerCase()
  let best = -1
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase())
    if (i >= 0 && (best < 0 || i < best)) best = i
  }
  const start = Math.max(0, (best < 0 ? 0 : best) - 40)
  const end = Math.min(body.length, start + 160)
  const slice = body.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + slice + (end < body.length ? '…' : '')
}

export const useSearchIndexStore = create<SearchIndexStore>((set, get) => ({
  index: null,
  status: 'idle',
  fileCount: 0,
  lastBuildKey: '',
  error: null,

  build: async () => {
    if (get().status === 'building') return
    const key = computeBuildKey()
    if (get().status === 'ready' && key === get().lastBuildKey) return

    const gen = ++buildGeneration
    set({ status: 'building', error: null })
    try {
      const folders = useFileStore.getState().openFolders
      const allPaths = folders
        .flatMap((f) => flattenFiles(f.tree))
        .filter((p) => INDEXABLE_EXT.has(fileExt(p)))

      const docs: IndexedDoc[] = []
      // Only retain a truncated version of each body for snippet generation.
      // The full content is only needed during indexing (MiniSearch stores its
      // own inverted index internally). This drops retained memory from
      // ~25 MB to ~1 MB for a typical 500-file workspace.
      const SNIPPET_BODY_LIMIT = 500
      const bodies = new Map<string, string>()
      for (let i = 0; i < allPaths.length; i += READ_BATCH) {
        const batch = allPaths.slice(i, i + READ_BATCH)
        const results = await Promise.all(
          batch.map(async (p) => {
            try {
              const body = await window.electronAPI.readFile(p)
              return { p, body }
            } catch {
              return null
            }
          }),
        )
        for (const r of results) {
          if (!r) continue
          docs.push({ id: r.p, name: fileName(r.p), path: r.p, body: r.body })
          bodies.set(r.p, r.body.slice(0, SNIPPET_BODY_LIMIT))
        }
      }

      // Bail if invalidate() fired (or another build() started) while we
      // were reading files — otherwise we'd overwrite the invalidated
      // state with a stale index.
      if (gen !== buildGeneration) return

      const ms = new MiniSearch<IndexedDoc>({
        fields: ['name', 'body'],
        storeFields: ['name', 'path'],
        idField: 'id',
        searchOptions: {
          boost: { name: 3 },
          prefix: true,
          fuzzy: 0.2,
        },
      })
      ms.addAll(docs)

      // Stash bodies on the index instance for snippet generation.
      ;(ms as unknown as { __bodies: Map<string, string> }).__bodies = bodies

      set({
        index: ms,
        status: 'ready',
        fileCount: docs.length,
        lastBuildKey: key,
      })
    } catch (err) {
      if (gen !== buildGeneration) return
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  },

  invalidate: () => {
    buildGeneration++
    set({ index: null, status: 'idle', fileCount: 0, lastBuildKey: '', error: null })
  },

  search: (query) => {
    const { index } = get()
    if (!index || !query.trim()) return []
    const results = index.search(query, { combineWith: 'AND' }).slice(0, 20)
    const bodies = (index as unknown as { __bodies?: Map<string, string> }).__bodies
    const terms = query.split(/\s+/).filter(Boolean)
    return results.map((r) => ({
      path: r.path as string,
      name: r.name as string,
      snippet: bodies ? snippetFor(bodies.get(r.id as string) ?? '', terms) : '',
      score: r.score,
    }))
  },
}))

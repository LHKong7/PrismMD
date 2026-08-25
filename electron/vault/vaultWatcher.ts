/**
 * Noticing that the vault changed underneath us.
 *
 * ★ The classification is the whole job, and it is why notes carry a UUID.
 * Watching a directory gives you "this path appeared" and "that path went
 * away"; without an identity inside the file those two facts about the *same
 * note* moved in Finder read as a delete and an unrelated create — which
 * would drop its backlinks, its annotations and its place in the tree, and
 * look to the user like the note was destroyed and a copy appeared.
 *
 * The reconciliation is a pure function over a batch of paths so it can be
 * tested without a filesystem race. The chokidar adapter underneath it is
 * deliberately thin, and mirrors `libraryWatcher` — the debounce and
 * `awaitWriteFinish` settings there are already tuned against real editors.
 */
import chokidar, { type FSWatcher } from 'chokidar'
import * as path from 'path'
import { isTempFile } from './atomicWrite'
import { isSupported } from '../services/fileFormats'
import { PRISM_DIR, TRASH_DIR } from './vaultLayout'

export type VaultChangeKind = 'created' | 'modified' | 'moved' | 'deleted'

export interface VaultChange {
  kind: VaultChangeKind
  /** Note id, once known. Null for a file that vanished before it was read. */
  pageId: string | null
  relativePath: string
  /** Only on a move. */
  previousPath?: string
}

/** What the reconciler needs to know about the world; injected for testing. */
export interface ReconcileContext {
  /** Catalog entry currently filed under this path, if any. */
  entryAtPath(relativePath: string): { id: string; contentHash: string } | null
  /** Where the catalog thinks a note with this id lives. */
  pathOfId(id: string): string | null
  /**
   * Read the file and return its identity and hash, or null when it is gone.
   * Also the point at which a newly-seen file gets an id written into it.
   */
  readFile(relativePath: string): Promise<{ id: string; contentHash: string } | null>
}

/**
 * Turn a batch of changed paths into note-level changes.
 *
 * Order matters: a rename arrives as two events, and processing the vanished
 * path first would emit a delete for a note that is about to be found again.
 * So every path is read first, and only then are the leftovers declared gone.
 */
export async function reconcilePaths(
  paths: string[],
  context: ReconcileContext,
): Promise<VaultChange[]> {
  const changes: VaultChange[] = []
  const seenIds = new Set<string>()
  const missing: string[] = []

  for (const relativePath of dedupe(paths)) {
    const before = context.entryAtPath(relativePath)
    const after = await context.readFile(relativePath)

    if (!after) {
      missing.push(relativePath)
      continue
    }
    seenIds.add(after.id)

    const previousPath = context.pathOfId(after.id)
    if (previousPath && previousPath !== relativePath) {
      changes.push({ kind: 'moved', pageId: after.id, relativePath, previousPath })
      continue
    }
    if (!before) {
      changes.push({ kind: 'created', pageId: after.id, relativePath })
      continue
    }
    if (before.contentHash !== after.contentHash) {
      changes.push({ kind: 'modified', pageId: after.id, relativePath })
    }
  }

  for (const relativePath of missing) {
    const before = context.entryAtPath(relativePath)
    // The note turned up at another path in this same batch: that was a move,
    // already reported. Reporting a delete too would tell the UI to drop it.
    if (before && seenIds.has(before.id)) continue
    changes.push({ kind: 'deleted', pageId: before?.id ?? null, relativePath })
  }

  return changes
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)]
}

/** Paths the watcher must never report: app data, trash, and our own temps. */
export function isWatchable(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/)
  if (segments.some((segment) => segment === PRISM_DIR || segment === TRASH_DIR)) return false
  if (segments.some((segment) => segment.startsWith('.') && segment !== '.')) return false
  const name = segments[segments.length - 1] ?? ''
  if (isTempFile(name)) return false
  // Directories have no extension; they matter (a new folder should appear).
  if (!/\.[a-z0-9]+$/i.test(name)) return true
  return isSupported(name)
}

export interface VaultWatcherOptions {
  root: string
  /** True while this process is writing the given absolute path. */
  wroteRecently(absolutePath: string): boolean
  /** Called with a settled batch of vault-relative paths. */
  onBatch(relativePaths: string[]): void
  /** Quiet period before a batch is delivered. */
  debounceMs?: number
}

/**
 * chokidar over the vault root, filtered and debounced.
 *
 * Self-writes are dropped here rather than downstream: PrismMD autosaves
 * while you type, and every one of those saves would otherwise come back as
 * "this note changed externally" — a conflict prompt against your own
 * keystroke.
 */
export class VaultWatcher {
  private watcher: FSWatcher | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending = new Set<string>()

  constructor(private readonly options: VaultWatcherOptions) {}

  start(): void {
    this.stop()
    this.watcher = chokidar.watch(this.options.root, {
      ignoreInitial: true,
      // The initial scan already walked the tree; what matters from here is
      // that a file has stopped being written before we read it.
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 50 },
      ignored: (candidate: string) => {
        if (candidate === this.options.root) return false
        return !isWatchable(path.relative(this.options.root, candidate))
      },
    })

    const onEvent = (absolute: string) => {
      if (this.options.wroteRecently(absolute)) return
      const relative = path.relative(this.options.root, absolute).split(path.sep).join('/')
      if (!relative || !isWatchable(relative)) return
      this.pending.add(relative)
      this.schedule()
    }

    for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const) {
      this.watcher.on(event, onEvent)
    }
    // A watcher error must not take the app down: the vault is still readable,
    // it just stops updating by itself until the next manual reconcile.
    this.watcher.on('error', (err) => console.warn('[vault] watcher error:', err))
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const batch = [...this.pending]
      this.pending.clear()
      if (batch.length > 0) this.options.onBatch(batch)
    }, this.options.debounceMs ?? 250)
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending.clear()
    void this.watcher?.close().catch(() => {})
    this.watcher = null
  }
}

/**
 * Watches the folder a reader window is showing.
 *
 * Reader mode never writes, so there is no sync or conflict problem here —
 * the folder is the single source of truth and the window is a view of it.
 * All this does is tell that view when the truth moved underneath it.
 *
 * One watcher per window, torn down when the window closes: two reader
 * windows on the same folder each get their own, which costs a little but
 * keeps disposal from having to reference-count.
 */
import chokidar, { type FSWatcher } from 'chokidar'
import { isSupported } from './fileFormats'

/** Coalesce bursts — an editor saving a file emits several events. */
const DEBOUNCE_MS = 250
/** Don't walk into these; a repo's .git alone would swamp the watcher. */
const IGNORED = /(^|[\\/])(\..|node_modules|__pycache__)/

interface Entry {
  watcher: FSWatcher
  timer: NodeJS.Timeout | null
  pending: Set<string>
}

const watchers = new Map<number, Entry>()

/**
 * Watch `root` on behalf of one window. Replaces any previous watcher for
 * that window (mounting a new folder retargets rather than accumulates).
 * `notify` receives the batch of changed paths after a quiet period.
 */
export function watchForWindow(
  webContentsId: number,
  root: string,
  notify: (paths: string[]) => void,
): void {
  stopWatching(webContentsId)

  const watcher = chokidar.watch(root, {
    ignored: IGNORED,
    ignoreInitial: true,
    // Depth is unbounded but listings are lazy, so a deep tree costs watch
    // descriptors only — not renderer work.
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  })

  const entry: Entry = { watcher, timer: null, pending: new Set() }
  watchers.set(webContentsId, entry)

  const onEvent = (changedPath: string) => {
    // Directories matter (a new subfolder should appear); files only matter
    // if we could render them.
    if (changedPath !== root && !isSupported(changedPath) && /\.[a-z0-9]+$/i.test(changedPath)) {
      return
    }
    entry.pending.add(changedPath)
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      const batch = [...entry.pending]
      entry.pending.clear()
      entry.timer = null
      if (batch.length > 0) notify(batch)
    }, DEBOUNCE_MS)
  }

  watcher
    .on('add', onEvent)
    .on('change', onEvent)
    .on('unlink', onEvent)
    .on('addDir', onEvent)
    .on('unlinkDir', onEvent)
    .on('error', (err) => console.warn('[library] watch error:', err))
}

export function stopWatching(webContentsId: number): void {
  const entry = watchers.get(webContentsId)
  if (!entry) return
  if (entry.timer) clearTimeout(entry.timer)
  void entry.watcher.close().catch(() => {})
  watchers.delete(webContentsId)
}

/** Test/shutdown helper. */
export function stopAllWatchers(): void {
  for (const id of [...watchers.keys()]) stopWatching(id)
}

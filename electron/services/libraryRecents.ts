/**
 * Recently-opened folders and files for reader mode.
 *
 * Reader mode is otherwise stateless — it stores nothing about *what you
 * read* (no progress, no highlights, no index). This is the one deliberate
 * exception: without it, every launch starts at an empty "pick a folder"
 * screen, which is a worse trade than remembering a dozen paths.
 *
 * It lives in its own store rather than in `prismmd-settings` because it
 * isn't a setting, and it never touches `workspace.db` — a reader window
 * must be able to work without the workspace database existing at all.
 */
import Store from 'electron-store'
import * as fs from 'fs'
interface LibraryRecents {
  roots: string[]
  files: string[]
}

const MAX_RECENTS = 12

const store = new Store<LibraryRecents>({
  name: 'prismmd-library',
  defaults: { roots: [], files: [] },
})
/** Most-recent-first, with paths that no longer exist dropped. */
function read(key: keyof LibraryRecents): string[] {
  const list = store.get(key, []) as string[]
  const alive = list.filter((p) => {
    try {
      fs.accessSync(p)
      return true
    } catch {
      return false
    }
  })
  if (alive.length !== list.length) store.set(key, alive)
  return alive
}

function remember(key: keyof LibraryRecents, entry: string): void {
  const next = [entry, ...read(key).filter((p) => p !== entry)].slice(0, MAX_RECENTS)
  store.set(key, next)
}

export function recentRoots(): string[] {
  return read('roots')
}

export function rememberRoot(dirPath: string): void {
  remember('roots', dirPath)
}

export function recentFiles(): string[] {
  return read('files')
}

export function rememberFile(filePath: string): void {
  remember('files', filePath)
}

export function clearRecents(): void {
  store.set('roots', [])
  store.set('files', [])
}

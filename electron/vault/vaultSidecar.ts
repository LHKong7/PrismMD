/**
 * `.prism/ui.json` — the two things a directory cannot express.
 *
 * A folder on disk has no sibling ordering and no icon. Both are real user
 * intent, and both have to live somewhere.
 *
 * ★ Not in front matter, deliberately. Writing sort order into the notes
 * means dragging an item in the sidebar rewrites content files, churns their
 * mtimes, and shows up as a diff in git — so people stop rearranging their
 * sidebar, which is the opposite of what the feature is for. This is the one
 * place the vault keeps user intent outside the Markdown, and the trade is
 * accepted knowingly: the file is **losable**. If it disappears, ordering
 * degrades to alphabetical and icons vanish; no note is affected.
 */
import * as fs from 'fs'
import * as path from 'path'
import { atomicWriteFile } from './atomicWrite'

interface SidecarData {
  /** Folder-relative-path -> ordered child ids. '' is the vault root. */
  order: Record<string, string[]>
  /** Note id or `dir:` folder id -> emoji. */
  icons: Record<string, string>
}

const EMPTY: SidecarData = { order: {}, icons: {} }

export class VaultSidecar {
  private data: SidecarData = { order: {}, icons: {} }
  private loaded = false

  constructor(private readonly file: string) {}

  private load(): SidecarData {
    if (this.loaded) return this.data
    this.loaded = true
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<SidecarData>
      this.data = {
        order: isRecord(parsed.order) ? parsed.order : {},
        icons: isRecord(parsed.icons) ? parsed.icons : {},
      }
    } catch {
      // Missing, unreadable or corrupt — all the same thing here. A losable
      // file that throws on read would take the whole workspace down with it.
      this.data = { ...EMPTY, order: {}, icons: {} }
    }
    return this.data
  }

  private async persist(): Promise<void> {
    await atomicWriteFile(this.file, `${JSON.stringify(this.load(), null, 2)}\n`)
  }

  /** Recorded order for a folder, ids only, possibly stale. */
  orderOf(folderPath: string): string[] {
    return this.load().order[folderPath] ?? []
  }

  /**
   * Sort `ids` by the recorded order, appending anything unrecorded — a note
   * created in another tool has no recorded position and belongs at the end
   * rather than nowhere.
   */
  sortByOrder(folderPath: string, ids: string[], fallbackKey: (id: string) => string): string[] {
    const recorded = this.orderOf(folderPath)
    const rank = new Map(recorded.map((id, index) => [id, index]))
    return [...ids].sort((a, b) => {
      const ra = rank.get(a)
      const rb = rank.get(b)
      if (ra !== undefined && rb !== undefined) return ra - rb
      if (ra !== undefined) return -1
      if (rb !== undefined) return 1
      return fallbackKey(a).localeCompare(fallbackKey(b))
    })
  }

  positionOf(folderPath: string, id: string): number {
    const at = this.orderOf(folderPath).indexOf(id)
    return at < 0 ? Number.MAX_SAFE_INTEGER : at
  }

  async place(folderPath: string, id: string, position: number): Promise<void> {
    const data = this.load()
    const current = (data.order[folderPath] ?? []).filter((existing) => existing !== id)
    const at = Math.max(0, Math.min(position, current.length))
    current.splice(at, 0, id)
    data.order[folderPath] = current
    await this.persist()
  }

  async forget(id: string): Promise<void> {
    const data = this.load()
    let touched = false
    for (const [folder, ids] of Object.entries(data.order)) {
      const next = ids.filter((existing) => existing !== id)
      if (next.length !== ids.length) {
        data.order[folder] = next
        touched = true
      }
    }
    if (data.icons[id] !== undefined) {
      delete data.icons[id]
      touched = true
    }
    if (touched) await this.persist()
  }

  iconOf(id: string): string | null {
    return this.load().icons[id] ?? null
  }

  async setIcon(id: string, icon: string | null): Promise<void> {
    const data = this.load()
    if (icon === null) delete data.icons[id]
    else data.icons[id] = icon
    await this.persist()
  }

  /** Re-key everything filed under an old folder path after a folder move. */
  async renameFolder(from: string, to: string): Promise<void> {
    const data = this.load()
    let touched = false
    for (const folder of Object.keys(data.order)) {
      if (folder !== from && !folder.startsWith(`${from}/`)) continue
      data.order[to + folder.slice(from.length)] = data.order[folder]
      delete data.order[folder]
      touched = true
    }
    if (touched) await this.persist()
  }

  /** Drop the in-memory copy so the next read comes from disk. */
  invalidate(): void {
    this.loaded = false
  }
}

function isRecord(value: unknown): value is Record<string, never> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sidecarFor(prismDir: string): VaultSidecar {
  return new VaultSidecar(path.join(prismDir, 'ui.json'))
}

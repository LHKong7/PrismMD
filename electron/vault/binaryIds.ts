/**
 * Identity for documents that cannot carry it themselves.
 *
 * ★ A Markdown note keeps its UUID in front matter, so it stays the same note
 * through any rename, move or external reorganisation. A PDF cannot: there is
 * nowhere in the file to put one without corrupting the document. So for
 * binary documents — and only for them — the mapping lives here.
 *
 * This makes `.prism/binaries.json` **main data, not cache**. Losing it does
 * not lose the PDF, but it does lose everything keyed to the PDF's id: its
 * highlights, and the extracted text that makes it searchable. It belongs in
 * a backup alongside `annotations/`, unlike `ui.json` next to it.
 *
 * The key is the path, which is the honest limit of what is possible here: a
 * PDF moved by another tool arrives as a new document with a new id. That is
 * strictly worse than the Markdown case and cannot be fixed without writing
 * into the file, so it is written down rather than hidden.
 */
import * as fs from 'fs'
import * as path from 'path'
import { atomicWriteFile } from './atomicWrite'

export class BinaryIdRegistry {
  private map: Record<string, string> | null = null

  constructor(private readonly file: string) {}

  private load(): Record<string, string> {
    if (this.map) return this.map
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as unknown
      this.map =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, string>)
          : {}
    } catch {
      this.map = {}
    }
    return this.map
  }

  idFor(relativePath: string): string | null {
    return this.load()[relativePath] ?? null
  }

  async remember(relativePath: string, id: string): Promise<void> {
    const map = this.load()
    if (map[relativePath] === id) return
    map[relativePath] = id
    await this.persist()
  }

  async forget(relativePath: string): Promise<void> {
    const map = this.load()
    if (!(relativePath in map)) return
    delete map[relativePath]
    await this.persist()
  }

  /**
   * Drop entries whose file is gone.
   *
   * Called from a full scan, where "gone" has been established by walking the
   * tree — never from a single-file check, because a path that is merely
   * absent from one listing may just have moved.
   */
  async prune(livePaths: Set<string>): Promise<void> {
    const map = this.load()
    let changed = false
    for (const key of Object.keys(map)) {
      if (livePaths.has(key)) continue
      delete map[key]
      changed = true
    }
    if (changed) await this.persist()
  }

  /** Bulk write, for the migration. */
  async replaceAll(entries: Record<string, string>): Promise<void> {
    this.map = { ...entries }
    await this.persist()
  }

  private async persist(): Promise<void> {
    await atomicWriteFile(this.file, `${JSON.stringify(this.load(), null, 2)}\n`)
  }

  /** Drop the in-memory copy so the next read comes from disk. */
  invalidate(): void {
    this.map = null
  }
}

export function binaryIdsFor(prismDir: string): BinaryIdRegistry {
  return new BinaryIdRegistry(path.join(prismDir, 'binaries.json'))
}

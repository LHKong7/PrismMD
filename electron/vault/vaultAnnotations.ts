/**
 * Highlights, stored beside the vault rather than in the app's database.
 *
 * ★ This is the second piece of **main data** under `.prism/` — the first
 * being `binaries.json`. The distinction matters for exactly one reason:
 * someone who backs up their vault folder, or syncs it, or checks it into
 * git, reasonably expects to have backed up their highlights too. Leaving
 * them in `workspace.db` means the folder that looks like "all my notes"
 * silently is not.
 *
 * Not in front matter, deliberately: an annotation carries character offsets
 * into the body, so writing one would rewrite the note it points into — and
 * the offsets of every annotation after it. Highlighting a passage must not
 * edit the passage.
 *
 * One file per note keeps a write local: adding a highlight touches one small
 * file, not a registry the size of the workspace, and two notes annotated at
 * once cannot clobber each other.
 */
import * as fs from 'fs'
import * as path from 'path'
import { atomicWriteFile } from './atomicWrite'

export interface StoredAnnotation {
  id: string
  startOffset: number
  endOffset: number
  selectedText: string
  color: string
  note?: string
  createdAt: string
  updatedAt: string
}

export class VaultAnnotations {
  constructor(private readonly dir: string) {}

  private fileFor(pageId: string): string {
    // Encoded because a page id is a UUID today but the type says "string",
    // and a path separator arriving in one would write outside the directory.
    return path.join(this.dir, `${encodeURIComponent(pageId)}.json`)
  }

  async load(pageId: string): Promise<StoredAnnotation[] | null> {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.fileFor(pageId), 'utf-8'))
      return Array.isArray(parsed) ? (parsed as StoredAnnotation[]) : []
    } catch (err) {
      // ★ Absent and unreadable are different answers. Absent means "nothing
      // here yet, go and look in the old store"; unreadable means "there is
      // something here and it is damaged", and returning [] for that would
      // let the next save overwrite whatever survived.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      console.error('[vault] Could not read annotations for', pageId, err)
      return []
    }
  }

  async save(pageId: string, annotations: StoredAnnotation[]): Promise<void> {
    const file = this.fileFor(pageId)
    if (annotations.length === 0) {
      // An empty file would be indistinguishable from "never annotated", and
      // would defeat the backfill below on the next read.
      await fs.promises.rm(file, { force: true }).catch(() => {})
      return
    }
    await fs.promises.mkdir(this.dir, { recursive: true })
    await atomicWriteFile(file, `${JSON.stringify(annotations, null, 2)}\n`)
  }

  /** Page ids that have a sidecar. Used by the backup/verify reporting. */
  async pageIds(): Promise<string[]> {
    const names = await fs.promises.readdir(this.dir).catch(() => [] as string[])
    return names
      .filter((name) => name.endsWith('.json'))
      .map((name) => decodeURIComponent(name.slice(0, -'.json'.length)))
  }
}

export function annotationsFor(annotationsDir: string): VaultAnnotations {
  return new VaultAnnotations(annotationsDir)
}

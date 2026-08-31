/**
 * What a deleted note needs in order to come back.
 *
 * ★ The trash directory is `.trash/<uuid>/<file>`, which loses the one fact a
 * restore depends on: where the note used to be. That fact used to live only
 * in a `note_trash` row — making the app's database the sole copy of
 * something no scan could reproduce, in direct contradiction of the rule the
 * vault is built on.
 *
 * So a `meta.json` goes into the trash directory next to the file. The
 * database table stays, as a cache: `reconcile()` rebuilds it by reading
 * these files, so deleting `prism.db` costs a directory walk rather than the
 * ability to undo a delete.
 *
 * One file per *deletion*, not per note: trashing a folder moves the whole
 * subtree in one move, and its descendants have no directory of their own to
 * put a file in. They are listed inside the folder's record instead.
 */
import * as fs from 'fs'
import * as path from 'path'
import { atomicWriteFile } from './atomicWrite'

export interface TrashRecord {
  id: string
  /** Vault-relative path the item was at when it was deleted. */
  originalPath: string
  title: string
  deletedAt: number
}

export interface TrashManifest extends TrashRecord {
  /** Notes and folders that went into the trash inside this one. */
  descendants: TrashRecord[]
}

const META_FILE = 'meta.json'

export class VaultTrash {
  constructor(private readonly dir: string) {}

  private fileFor(id: string): string {
    return path.join(this.dir, encodeURIComponent(id), META_FILE)
  }

  async write(manifest: TrashManifest): Promise<void> {
    const file = this.fileFor(manifest.id)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await atomicWriteFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
  }

  async forget(id: string): Promise<void> {
    await fs.promises.rm(this.fileFor(id), { force: true }).catch(() => {})
  }

  /**
   * Every manifest in the trash, for rebuilding the table.
   *
   * A directory with no manifest is skipped rather than guessed at: it was
   * emptied by hand, or written by a version of the app that did not keep
   * one, and inventing an original path would restore the note somewhere the
   * user never put it.
   */
  async readAll(): Promise<TrashManifest[]> {
    const names = await fs.promises.readdir(this.dir).catch(() => [] as string[])
    const out: TrashManifest[] = []
    for (const name of names) {
      const raw = await fs.promises
        .readFile(path.join(this.dir, name, META_FILE), 'utf-8')
        .catch(() => null)
      if (raw === null) continue
      const parsed = parseManifest(raw)
      if (parsed) out.push(parsed)
    }
    return out
  }
}

function parseManifest(raw: string): TrashManifest | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TrashManifest>
    if (typeof parsed.id !== 'string' || typeof parsed.originalPath !== 'string') return null
    return {
      id: parsed.id,
      originalPath: parsed.originalPath,
      title: typeof parsed.title === 'string' ? parsed.title : parsed.originalPath,
      deletedAt: typeof parsed.deletedAt === 'number' ? parsed.deletedAt : 0,
      descendants: Array.isArray(parsed.descendants)
        ? parsed.descendants.filter(
            (item): item is TrashRecord =>
              !!item && typeof item.id === 'string' && typeof item.originalPath === 'string',
          )
        : [],
    }
  } catch {
    // A damaged manifest loses one item's restore path, not the trash.
    return null
  }
}

export function trashFor(trashDir: string): VaultTrash {
  return new VaultTrash(trashDir)
}

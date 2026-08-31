/**
 * Snapshot history, stored beside the vault rather than in a database.
 *
 * ★ **Main data**, like `annotations/` and `binaries.json`. A snapshot is a
 * copy of something the user wrote at a moment they chose to keep — take it
 * away and nothing else on disk can produce it again. Leaving it in the
 * app's database would mean the folder that looks like "all my notes" is one
 * `rm` away from losing every version anyone ever rolled back to, and that
 * the index rebuild button — which is supposed to cost only time — silently
 * costs history.
 *
 * One file per snapshot under `<vault>/.prism/versions/<pageId>/`, written as
 * Markdown with its metadata in front matter. Not JSON, on purpose: the point
 * of a vault is that a person with a text editor can get their work back, and
 * an old draft of a note should read like an old draft of a note.
 *
 * The file name leads with the timestamp so a directory listing is already in
 * order, and carries the snapshot id so two snapshots taken in the same
 * millisecond cannot collide.
 */
import * as fs from 'fs'
import * as path from 'path'
import { atomicWriteFile } from './atomicWrite'
import { composeNote, parseNote } from './frontmatter'

export interface StoredVersion {
  id: string
  pageId: string
  title: string | null
  source: string
  label: string | null
  createdAt: number
  content: string
}

export type StoredVersionMeta = Omit<StoredVersion, 'content'> & { length: number }

/** Keeps a directory listing sorted newest-first without reading any file. */
function fileNameFor(version: Pick<StoredVersion, 'id' | 'createdAt'>): string {
  return `${String(version.createdAt).padStart(14, '0')}-${encodeURIComponent(version.id)}.md`
}

export class VaultVersions {
  constructor(private readonly dir: string) {}

  private dirFor(pageId: string): string {
    // Encoded for the same reason the annotation sidecar encodes: the type
    // says "string", and a separator arriving in one would write out of bounds.
    return path.join(this.dir, encodeURIComponent(pageId))
  }

  async save(version: StoredVersion): Promise<void> {
    const dir = this.dirFor(version.pageId)
    await fs.promises.mkdir(dir, { recursive: true })
    const source = composeNote(
      {
        id: version.id,
        title: version.title ?? undefined,
        created: new Date(version.createdAt).toISOString(),
      },
      version.content,
    )
    await atomicWriteFile(path.join(dir, fileNameFor(version)), withMeta(source, version))
  }

  async list(pageId: string): Promise<StoredVersionMeta[]> {
    const dir = this.dirFor(pageId)
    const names = await fs.promises.readdir(dir).catch(() => [] as string[])
    const out: StoredVersionMeta[] = []
    for (const name of names) {
      if (!name.endsWith('.md')) continue
      const version = await this.read(path.join(dir, name), pageId)
      if (version) out.push({ ...stripContent(version), length: version.content.length })
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }

  async get(pageId: string, versionId: string): Promise<StoredVersion | null> {
    const dir = this.dirFor(pageId)
    const names = await fs.promises.readdir(dir).catch(() => [] as string[])
    const wanted = `-${encodeURIComponent(versionId)}.md`
    const name = names.find((candidate) => candidate.endsWith(wanted))
    return name ? this.read(path.join(dir, name), pageId) : null
  }

  async remove(pageId: string, versionId: string): Promise<void> {
    const dir = this.dirFor(pageId)
    const names = await fs.promises.readdir(dir).catch(() => [] as string[])
    const wanted = `-${encodeURIComponent(versionId)}.md`
    for (const name of names) {
      if (name.endsWith(wanted)) await fs.promises.rm(path.join(dir, name), { force: true })
    }
  }

  /**
   * Drop everything past the newest `keep` snapshots of one note.
   *
   * ★ Oldest-first, and only ever within a single note's directory. A prune
   * that walked the whole tree would be one bad glob away from deleting the
   * history of notes it was never asked about.
   */
  async prune(pageId: string, keep: number): Promise<void> {
    const versions = await this.list(pageId)
    for (const version of versions.slice(keep)) await this.remove(pageId, version.id)
  }

  /** Every page id with a history, for backup reporting and migration. */
  async pageIds(): Promise<string[]> {
    const names = await fs.promises.readdir(this.dir).catch(() => [] as string[])
    return names.map((name) => decodeURIComponent(name))
  }

  private async read(file: string, pageId: string): Promise<StoredVersion | null> {
    let raw: string
    try {
      raw = await fs.promises.readFile(file, 'utf-8')
    } catch (err) {
      // A snapshot that cannot be read must not take the whole history down
      // with it — the other snapshots of this note are still recoverable.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[vault] Could not read snapshot', file, err)
      }
      return null
    }
    const parsed = parseNote(raw)
    const meta = parseMeta(parsed.rawFrontmatter ?? '')
    const id = parsed.frontmatter.id
    if (!id) return null
    return {
      id,
      pageId,
      title: parsed.frontmatter.title ?? null,
      source: meta.source ?? 'manual',
      label: meta.label ?? null,
      createdAt: Date.parse(parsed.frontmatter.created ?? '') || 0,
      content: parsed.body,
    }
  }
}

/**
 * Add the two keys `frontmatter.ts` does not own.
 *
 * ★ Deliberately not added to its writable set. That module's field list is
 * the contract for what PrismMD writes into **notes**, and widening it so a
 * private snapshot header can reuse the machinery would mean every note in
 * the vault could grow a `prism-source:` line. These files are ours alone.
 */
function withMeta(source: string, version: StoredVersion): string {
  const extra = [`prism-source: ${quote(version.source)}`]
  if (version.label) extra.push(`prism-label: ${quote(version.label)}`)
  const lines = source.split('\n')
  // composeNote always emits the opening fence first when there is a header,
  // and there always is: the snapshot carries an id.
  lines.splice(1, 0, ...extra)
  return lines.join('\n')
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseMeta(inner: string): { source?: string; label?: string } {
  const out: { source?: string; label?: string } = {}
  for (const line of inner.split('\n')) {
    const match = /^prism-(source|label):[ \t]*(.*)$/.exec(line)
    if (!match) continue
    const value = match[2].trim().replace(/^"(.*)"$/s, '$1').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    if (match[1] === 'source') out.source = value
    else out.label = value
  }
  return out
}

function stripContent(version: StoredVersion): Omit<StoredVersion, 'content'> {
  const { content: _content, ...rest } = version
  return rest
}

export function versionsFor(versionsDir: string): VaultVersions {
  return new VaultVersions(versionsDir)
}

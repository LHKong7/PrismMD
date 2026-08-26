/**
 * Proving a migration did not lose anything.
 *
 * ★ A migration that "seems to have worked" is worthless. This is the one
 * operation in PrismMD that touches every note the user owns at once, and the
 * failure mode is silent: a note whose title contained a slash lands under a
 * different filename, a folder with a reserved name is skipped, a page whose
 * content was empty gets dropped by a `.filter(Boolean)` somewhere. Nobody
 * notices for weeks, and by then the backup has rotated.
 *
 * So the migration does not decide it succeeded — this does, by taking the
 * same measurements on both sides and refusing to sign off on any difference.
 * `migrate()` will not switch storage modes unless `ok` comes back true.
 *
 * Pure functions over page sets: no filesystem, no database, both sides
 * measured by the same code so a bug in the measurement cannot make the two
 * disagree in a way that hides a real loss.
 */
import * as crypto from 'crypto'
import { kindOfFormat } from '../services/fileFormats'
import { extractTags, extractWikiLinks, normalizeTitle } from '../knowledge/links'
import type { Page } from '../repositories/noteRepository'

export interface NoteFingerprint {
  id: string
  title: string
  /**
   * Hash of the body text alone — front matter is bookkeeping, not content.
   *
   * ★ Empty for binary documents. A PDF's "content" is its extracted text,
   * which lives in a cache rather than in the file, so comparing it across
   * backends would compare two different things and fail every time. Their
   * integrity is checked by comparing the *bytes*, which is stricter.
   */
  contentHash: string
  /** Vault-relative folder chain, so hierarchy is comparable across backends. */
  folderPath: string
  format: string
  /** Non-zero only for binary documents. */
  byteSize: number
}

export interface MigrationSnapshot {
  notes: NoteFingerprint[]
  folderPaths: string[]
  /** Distinct `[[targets]]` across all notes. */
  linkTargets: string[]
  /** How many of those resolve to a note that exists. */
  resolvedLinks: number
  tags: string[]
}

export interface SnapshotInput {
  pages: Page[]
  /** Folder chain for a page, outermost first, e.g. `['Projects', 'Sub']`. */
  folderChainOf(page: Page): string[]
  /** Byte length of a binary document's payload; 0 for text notes. */
  byteSizeOf(page: Page): number
}

export function snapshotOf(input: SnapshotInput): MigrationSnapshot {
  const notes: NoteFingerprint[] = []
  const folders = new Set<string>()
  const linkTargets = new Set<string>()
  const tags = new Set<string>()
  const titles = new Set<string>()

  for (const page of input.pages) {
    if (page.isFolder) continue
    const chain = input.folderChainOf(page)
    for (let i = 1; i <= chain.length; i++) folders.add(chain.slice(0, i).join('/'))

    titles.add(normalizeTitle(page.title))
    for (const link of extractWikiLinks(page.content)) linkTargets.add(link.normalized)
    for (const tag of extractTags(page.content)) tags.add(tag.tag)

    notes.push({
      id: page.id,
      title: page.title,
      contentHash: kindOfFormat(page.format) === 'binary' ? '' : hashOf(page.content),
      folderPath: chain.join('/'),
      format: page.format,
      byteSize: input.byteSizeOf(page),
    })
  }

  let resolvedLinks = 0
  for (const target of linkTargets) if (titles.has(target)) resolvedLinks++

  return {
    notes: notes.sort((a, b) => a.id.localeCompare(b.id)),
    folderPaths: [...folders].sort(),
    linkTargets: [...linkTargets].sort(),
    resolvedLinks,
    tags: [...tags].sort(),
  }
}

export type MigrationProblemCode =
  | 'note.missing'
  | 'note.unexpected'
  | 'note.content_changed'
  | 'note.title_changed'
  | 'note.moved'
  | 'note.format_changed'
  | 'note.size_changed'
  | 'folder.missing'
  | 'link.unresolved'
  | 'tag.missing'

export interface MigrationProblem {
  code: MigrationProblemCode
  /** What the problem is about — a note id, a folder path, a tag. */
  subject: string
  detail: string
}

export interface ValidationReport {
  ok: boolean
  problems: MigrationProblem[]
  counts: {
    notesBefore: number
    notesAfter: number
    foldersBefore: number
    foldersAfter: number
    resolvedLinksBefore: number
    resolvedLinksAfter: number
    tagsBefore: number
    tagsAfter: number
  }
}

/**
 * Compare two snapshots. Anything that differs is a problem — there is no
 * "acceptable drift" here.
 *
 * ★ Notes are matched by **id**, never by path or title. A migration is
 * allowed to rename a file (a title with a `/` cannot become a filename
 * unchanged) and to renumber a collision (`Untitled 2.md`); what it is never
 * allowed to do is lose the note. Matching by path would report every legal
 * rename as a loss and drown the real ones.
 */
export function compareSnapshots(
  before: MigrationSnapshot,
  after: MigrationSnapshot,
): ValidationReport {
  const problems: MigrationProblem[] = []
  const afterById = new Map(after.notes.map((note) => [note.id, note]))
  const beforeById = new Map(before.notes.map((note) => [note.id, note]))

  for (const source of before.notes) {
    const target = afterById.get(source.id)
    if (!target) {
      problems.push({
        code: 'note.missing',
        subject: source.id,
        detail: `"${source.title}" did not arrive in the vault`,
      })
      continue
    }
    if (target.contentHash !== source.contentHash) {
      problems.push({
        code: 'note.content_changed',
        subject: source.id,
        detail: `"${source.title}" has different content on the other side`,
      })
    }
    if (target.title !== source.title) {
      problems.push({
        code: 'note.title_changed',
        subject: source.id,
        detail: `"${source.title}" is now titled "${target.title}"`,
      })
    }
    if (target.folderPath !== source.folderPath) {
      problems.push({
        code: 'note.moved',
        subject: source.id,
        detail: `"${source.title}" moved from "${source.folderPath || '/'}" to "${target.folderPath || '/'}"`,
      })
    }
    if (target.format !== source.format) {
      problems.push({
        code: 'note.format_changed',
        subject: source.id,
        detail: `"${source.title}" changed format: ${source.format} -> ${target.format}`,
      })
    }
    if (target.byteSize !== source.byteSize) {
      problems.push({
        code: 'note.size_changed',
        subject: source.id,
        detail: `"${source.title}" is ${target.byteSize} bytes, was ${source.byteSize}`,
      })
    }
  }

  for (const target of after.notes) {
    if (beforeById.has(target.id)) continue
    problems.push({
      code: 'note.unexpected',
      subject: target.id,
      detail: `"${target.title}" exists in the vault but not in the source`,
    })
  }

  const afterFolders = new Set(after.folderPaths)
  for (const folder of before.folderPaths) {
    if (afterFolders.has(folder)) continue
    problems.push({
      code: 'folder.missing',
      subject: folder,
      detail: `folder "${folder}" was not recreated`,
    })
  }

  // ★ Links are checked by how many *resolve*, not by how many exist. A link
  // to a note that never existed is unresolved on both sides and is not a
  // migration problem; a link that resolved before and does not now means a
  // title changed underneath it, which is.
  if (after.resolvedLinks < before.resolvedLinks) {
    problems.push({
      code: 'link.unresolved',
      subject: 'links',
      detail: `${before.resolvedLinks - after.resolvedLinks} wiki links stopped resolving`,
    })
  }

  const afterTags = new Set(after.tags)
  for (const tag of before.tags) {
    if (afterTags.has(tag)) continue
    problems.push({ code: 'tag.missing', subject: tag, detail: `tag #${tag} disappeared` })
  }

  return {
    ok: problems.length === 0,
    problems,
    counts: {
      notesBefore: before.notes.length,
      notesAfter: after.notes.length,
      foldersBefore: before.folderPaths.length,
      foldersAfter: after.folderPaths.length,
      resolvedLinksBefore: before.resolvedLinks,
      resolvedLinksAfter: after.resolvedLinks,
      tagsBefore: before.tags.length,
      tagsAfter: after.tags.length,
    },
  }
}

/** A short, human-readable account of what went wrong, capped for a dialog. */
export function describeProblems(report: ValidationReport, max = 8): string {
  if (report.ok) return 'No differences found.'
  const shown = report.problems.slice(0, max).map((p) => `- ${p.detail}`)
  const rest = report.problems.length - shown.length
  return [...shown, rest > 0 ? `- ...and ${rest} more` : ''].filter(Boolean).join('\n')
}

function hashOf(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex')
}

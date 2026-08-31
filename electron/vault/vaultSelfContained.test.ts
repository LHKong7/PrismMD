/**
 * The claim stage 5 rests on: **`prism.db` is disposable**.
 *
 * The vault model says everything in SQLite must be reconstructible by
 * walking the files. That is easy to assert about the search index, which was
 * always derived, and easy to get wrong everywhere else — a snapshot, a
 * restore path, a note's status are all things a scan cannot invent, and each
 * one of them lived in the database at some point in this project's life.
 *
 * ★ So the test is destructive rather than descriptive: build a vault, use
 * every feature that keeps per-note state, **delete the database**, open the
 * vault with an empty one, and require everything the user made to still be
 * there. Nothing here inspects an implementation; it only asks what survives.
 */
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { MarkdownVaultRepository } from './markdownVaultRepository'
import { versionsFor } from './vaultVersions'
import { annotationsFor } from './vaultAnnotations'
import { vaultPaths } from './vaultLayout'

const open: Database.Database[] = []
const roots: string[] = []

function freshRoot(): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-selfcontained-')))
  roots.push(root)
  return root
}

/** Open the vault with a database that knows nothing — as if it were lost. */
async function reopen(root: string): Promise<MarkdownVaultRepository> {
  const db = new Database(':memory:')
  open.push(db)
  const repo = new MarkdownVaultRepository({ root, db })
  await repo.scan()
  return repo
}

afterEach(() => {
  while (open.length) open.pop()!.close()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('a vault survives losing its database', () => {
  it('keeps the notes, which were never in it', async () => {
    const root = freshRoot()
    const first = await reopen(root)
    await first.createPage({ title: 'Kalman Filter', content: 'body text' })

    const second = await reopen(root)
    expect((await second.listPages()).map((page) => page.content)).toEqual(['body text'])
  })

  it('keeps a note identity, so backlinks and highlights still point at it', async () => {
    const root = freshRoot()
    const first = await reopen(root)
    const page = await first.createPage({ title: 'Anchored', content: 'x' })

    const second = await reopen(root)
    expect((await second.getPage(page.id))?.title).toBe('Anchored')
  })

  it('keeps status, genre and quality', async () => {
    // ★ These are judgements the user made. Before stage 5 they were a
    // `page_meta` row, which in vault mode was never written at all — the
    // foreign key to `pages` rejected it, and nothing said so.
    const root = freshRoot()
    const first = await reopen(root)
    const page = await first.createPage({ title: 'Judged', content: 'body' })
    await first.setNoteMeta(page.id, { status: 'done', genre: 'tech', quality: 4 })

    const second = await reopen(root)
    expect(await second.getNoteMeta(page.id)).toEqual({
      status: 'done', genre: 'tech', quality: 4,
    })
  })

  it('keeps a deleted note restorable to where it came from', async () => {
    // ★ The original path existed only as a `note_trash` row. Losing it does
    // not just lose the undo — the file is still sitting in `.trash` with
    // nothing left to say where it belongs.
    const root = freshRoot()
    const first = await reopen(root)
    const folder = await first.createFolder({ title: 'Projects' })
    const page = await first.createPage({ title: 'Doomed', content: 'precious', parentId: folder.id })
    await first.deletePage(page.id)

    const second = await reopen(root)
    await second.restorePage(page.id)

    const back = await second.getPage(page.id)
    expect(back!.content).toBe('precious')
    expect(back!.parentId).toBe(folder.id)
  })

  it('keeps a trashed folder and its descendants restorable', async () => {
    const root = freshRoot()
    const first = await reopen(root)
    const folder = await first.createFolder({ title: 'Doomed folder' })
    const child = await first.createPage({ title: 'Child', content: 'inside', parentId: folder.id })
    await first.deletePage(folder.id)

    const second = await reopen(root)
    await second.restorePage(folder.id)
    expect((await second.getPage(child.id))?.content).toBe('inside')
  })

  it('forgets a trash entry someone emptied by hand', async () => {
    const root = freshRoot()
    const first = await reopen(root)
    const page = await first.createPage({ title: 'Doomed', content: 'x' })
    await first.deletePage(page.id)
    fs.rmSync(vaultPaths(root).trash, { recursive: true, force: true })

    const second = await reopen(root)
    // Nothing to restore, and no error: the row was a cache of a directory
    // that is gone.
    await second.restorePage(page.id)
    expect(await second.getPage(page.id)).toBeNull()
  })

  it('keeps snapshot history and highlights, which live beside the notes', async () => {
    const root = freshRoot()
    const first = await reopen(root)
    const page = await first.createPage({ title: 'Rewritten', content: 'new text' })

    await versionsFor(vaultPaths(root).versions).save({
      id: 'v1',
      pageId: page.id,
      title: 'Rewritten',
      source: 'round-table',
      label: 'before the rewrite',
      createdAt: 1000,
      content: 'old text',
    })
    await annotationsFor(vaultPaths(root).annotations).save(page.id, [{
      id: 'a1',
      startOffset: 0,
      endOffset: 3,
      selectedText: 'new',
      color: 'yellow',
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z',
    }])

    fs.rmSync(path.join(vaultPaths(root).prism, 'prism.db'), { force: true })
    await reopen(root)

    expect((await versionsFor(vaultPaths(root).versions).get(page.id, 'v1'))!.content)
      .toBe('old text')
    expect(await annotationsFor(vaultPaths(root).annotations).load(page.id)).toHaveLength(1)
  })

  it('does not keep the extracted text of a binary document, and says so', async () => {
    // ★ The one declared exception (D3). A PDF's text layer is produced by
    // the renderer, so the main process cannot re-derive it at startup — it
    // comes back the next time the document is opened, not on the next scan.
    // Written down as a test so "rebuildable, but only lazily" stays a
    // decision rather than becoming a bug report.
    const root = freshRoot()
    const first = await reopen(root)
    const page = await first.importDroppedFile('Paper.pdf', new Uint8Array([1, 2, 3]), null)
    await first.updatePage(page.id, { content: 'extracted text' })
    expect((await first.getPage(page.id))!.content).toBe('extracted text')

    const second = await reopen(root)
    expect((await second.getPage(page.id))!.content).toBe('')
    // The document itself is untouched, which is what matters.
    expect(await second.readPageBytes(page.id)).toEqual(new Uint8Array([1, 2, 3]))
  })
})

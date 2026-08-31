/**
 * The plan's stage-4 acceptance criteria, run for real: wiki links,
 * backlinks, Chinese search, related notes, AI retrieval with citations, and
 * rename propagation — all against a vault of Markdown files on disk.
 *
 * ★ Why this exists as its own suite. `engine.test.ts` proves the index works
 * against pages handed to it; `markdownVaultRepository.test.ts` proves the
 * vault reads and writes files. Neither proves the *pair* works, and the pair
 * is where the bug lived: every query in the engine joined a `pages` table
 * that a vault does not populate, so on a real vault every one of these
 * features returned nothing at all — with no error anywhere.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { MarkdownVaultRepository } from './markdownVaultRepository'
import {
  buildRetrievalContext,
  getBacklinks,
  getKnowledgeStats,
  getOutgoingLinks,
  getRelatedNotes,
  getUnresolvedLinks,
  searchNotes,
  syncIndex,
  type IndexablePage,
} from '../knowledge/engine'

let root: string
let db: Database.Database
let vault: MarkdownVaultRepository

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-kv-')))
  db = new Database(':memory:')
  vault = new MarkdownVaultRepository({ root, db })
})

afterEach(() => {
  db.close()
  fs.rmSync(root, { recursive: true, force: true })
})

/** Index the vault the way `knowledgeService.syncWorkspaceIndex` does. */
async function reindex() {
  const pages = await vault.listPages()
  const indexable: IndexablePage[] = pages.map((page) => ({
    id: page.id,
    title: page.title || 'Untitled',
    content: page.content ?? '',
    format: page.format || 'md',
    updatedAt: page.updatedAt ?? 0,
    isFolder: page.isFolder,
  }))
  return syncIndex(db, indexable)
}

describe('the knowledge layer over a vault', () => {
  it('indexes notes that are files', async () => {
    await vault.createPage({ title: 'Scheduler', content: '# Scheduler\n\nExponential backoff.\n' })
    expect(await reindex()).toMatchObject({ indexed: 1, removed: 0 })
    expect(getKnowledgeStats(db).notes).toBe(1)
  })

  it('finds a passage by its words, with the heading path that locates it', async () => {
    await vault.createPage({
      title: 'Scheduler',
      content:
        '# Scheduler\n\nThe scheduler dispatches queued work to idle agents once per tick, and '
        + 'skips a tick when the previous round has not finished.\n\n'
        + '## Retry\n\nThe scheduler retries with exponential backoff, three attempts, then gives '
        + 'up rather than holding the queue open forever.\n',
    })
    await reindex()

    const [hit] = searchNotes(db, 'exponential backoff')
    expect(hit.title).toBe('Scheduler')
    expect(hit.headingPath).toEqual(['Scheduler', 'Retry'])
    expect(hit.snippet).toContain('backoff')
  })

  it('searches Chinese notes', async () => {
    // ★ Two independent things have to hold at once here: the CJK bigram
    // tokenizer, and the index reading its own tables rather than `pages`.
    // Either one broken returns exactly the same empty array.
    await vault.createPage({ title: '检索笔记', content: '# 检索笔记\n\n用 SQLite 做全文检索，中文也要能搜到。\n' })
    await vault.createPage({ title: 'Unrelated', content: 'nothing to do with it' })
    await reindex()

    expect(searchNotes(db, '全文检索').map((h) => h.title)).toEqual(['检索笔记'])
    expect(searchNotes(db, '中文').map((h) => h.title)).toEqual(['检索笔记'])
  })

  it('reads wiki links out of files and resolves them by title', async () => {
    await vault.createPage({ title: 'Kalman Filter', content: '# Kalman Filter\n\nA recursive estimator.\n' })
    await vault.createPage({ title: 'Reading list', content: 'read [[Kalman Filter]] next' })
    await reindex()

    const source = (await vault.listPages()).find((p) => p.title === 'Reading list')!
    const [link] = getOutgoingLinks(db, source.id)
    expect(link).toMatchObject({ resolved: true, title: 'Kalman Filter' })
  })

  it('gives a note its backlinks', async () => {
    const target = await vault.createPage({ title: 'Kalman Filter', content: 'theory' })
    await vault.createPage({ title: 'Reading list', content: 'read [[Kalman Filter]] next' })
    await reindex()

    expect(getBacklinks(db, target.id).map((b) => b.title)).toEqual(['Reading list'])
  })

  it('lists links to notes that have not been written yet', async () => {
    await vault.createPage({ title: 'Source', content: 'I should read about [[Kalman Filter]].' })
    await reindex()
    expect(getUnresolvedLinks(db).map((u) => u.target)).toEqual(['Kalman Filter'])

    // Writing the note connects it, with no explicit linking step.
    await vault.createPage({ title: 'Kalman Filter', content: 'theory' })
    await reindex()
    expect(getUnresolvedLinks(db)).toEqual([])
  })

  it('relates notes by link, and by wording alone', async () => {
    const home = await vault.createPage({
      title: 'Home',
      content: '# Home\n\nA note about caching strategies. See [[Cache Invalidation]].\n',
    })
    await vault.createPage({
      title: 'Cache Invalidation',
      content: '# Cache Invalidation\n\nHow to know when to drop a cache entry.\n',
    })
    await vault.createPage({
      title: 'Caching Notes',
      content: '# Caching Notes\n\nA note about caching strategies in general.\n',
    })
    await reindex()

    const related = getRelatedNotes(db, home.id)
    expect(related[0].title).toBe('Cache Invalidation')
    expect(related[0].reasons).toContain('link')
    expect(related.map((r) => r.title)).toContain('Caching Notes')
  })

  it('retrieves passages for the assistant, each citing a real note', async () => {
    await vault.createPage({
      title: 'Retry Policy',
      content:
        '# Retry Policy\n\nEvery outbound call is subject to this policy.\n\n'
        + '## Backoff\n\nWe retry three times with exponential backoff before surfacing the '
        + 'failure, doubling the delay after each attempt.\n',
    })
    await reindex()

    const { context, citations } = buildRetrievalContext(db, 'how many retries and what backoff?')
    expect(context).toContain('[1]')
    expect(citations[0].title).toBe('Retry Policy')

    // ★ The citation has to resolve back to a note the app can open. A number
    // pointing at nothing is worse than no citation: it looks checkable.
    expect(await vault.getPage(citations[0].pageId)).not.toBeNull()
  })

  it('follows a rename through the files and back into the index', async () => {
    const target = await vault.createPage({ title: 'Kalman Filter', content: 'theory' })
    const source = await vault.createPage({ title: 'Reading list', content: 'read [[Kalman Filter]]' })
    await reindex()

    const { relinked } = await vault.renamePage(target.id, 'Kalman Smoother')
    expect(relinked.map((r) => r.pageId)).toEqual([source.id])
    await reindex()

    // The file on disk carries the new link…
    expect(fs.readFileSync(path.join(root, 'Reading list.md'), 'utf-8'))
      .toContain('[[Kalman Smoother]]')
    // …and the backlink survived the rename rather than being dropped.
    expect(getBacklinks(db, target.id).map((b) => b.title)).toEqual(['Reading list'])
  })

  it('drops a note from every view once it is deleted', async () => {
    const doomed = await vault.createPage({ title: 'Doomed', content: 'findable text' })
    await vault.createPage({ title: 'Kept', content: 'other text' })
    await reindex()
    expect(searchNotes(db, 'findable')).toHaveLength(1)

    await vault.deletePage(doomed.id)
    await reindex()
    expect(searchNotes(db, 'findable')).toEqual([])
    expect(getKnowledgeStats(db).notes).toBe(1)
  })

  it('picks up a note written by another tool', async () => {
    fs.writeFileSync(
      path.join(root, 'From Obsidian.md'),
      '# From Obsidian\n\nwritten elsewhere, with a [[Link]] and a #tag\n',
    )
    await vault.scan()
    await reindex()

    expect(searchNotes(db, 'written elsewhere').map((h) => h.title)).toEqual(['From Obsidian'])
    expect(getUnresolvedLinks(db).map((u) => u.target)).toEqual(['Link'])
    expect(getKnowledgeStats(db).tags).toBe(1)
  })

  it('keeps a note findable after it is moved in Finder', async () => {
    const page = await vault.createPage({ title: 'Travels', content: 'distinctive wording here' })
    await reindex()

    fs.mkdirSync(path.join(root, 'Elsewhere'))
    fs.renameSync(path.join(root, 'Travels.md'), path.join(root, 'Elsewhere', 'Travels.md'))
    await vault.scan()
    await reindex()

    // Same note, same id — not a delete plus a create.
    const [hit] = searchNotes(db, 'distinctive wording')
    expect(hit.pageId).toBe(page.id)
    expect(getKnowledgeStats(db).notes).toBe(1)
  })

  it('re-indexes an edit made outside the app', async () => {
    // Distinct words with nothing in common: query terms are OR-ed for
    // recall, so any shared word would keep the old text "matching".
    const page = await vault.createPage({ title: 'Edited', content: 'aardvark' })
    await reindex()

    const file = path.join(root, 'Edited.md')
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('aardvark', 'zeppelin'))
    await vault.scan()
    await reindex()

    expect(searchNotes(db, 'aardvark')).toEqual([])
    expect(searchNotes(db, 'zeppelin').map((h) => h.pageId)).toEqual([page.id])
  })

  it('re-indexing an unchanged vault is a no-op', async () => {
    await vault.createPage({ title: 'Stable', content: 'body' })
    await reindex()
    expect(await reindex()).toMatchObject({ indexed: 0, skipped: 1, removed: 0 })
  })
})

describe('reconciling external changes into the index', () => {
  /** What storageService.applyExternalChanges does, minus the IPC. */
  async function applyBatch(paths: string[]) {
    const { reconcilePaths } = await import('./vaultWatcher')
    const changes = await reconcilePaths(paths, vault.reconcileContext())

    for (const change of changes) {
      if (change.kind === 'deleted') {
        vault.forgetPath(change.relativePath)
        continue
      }
      const page = change.pageId ? await vault.getPage(change.pageId) : null
      if (!page) continue
      syncIndex(db, [
        {
          id: page.id,
          title: page.title,
          content: page.content,
          format: page.format,
          updatedAt: page.updatedAt,
          isFolder: page.isFolder,
        },
      ], { force: true })
    }
    return changes
  }

  it('indexes a note another tool dropped into the folder', async () => {
    fs.writeFileSync(path.join(root, 'Dropped.md'), '# Dropped\n\nsomething distinctive\n')
    const changes = await applyBatch(['Dropped.md'])

    expect(changes.map((c) => c.kind)).toEqual(['created'])
    expect(searchNotes(db, 'distinctive').map((h) => h.title)).toEqual(['Dropped'])
  })

  it('reports a rename in Finder as one move, and the note keeps its id', async () => {
    // ★ The reason notes carry a UUID. Reported as delete + create, the note
    // would lose its backlinks and its highlights, and the user would watch it
    // vanish and a stranger appear in its place.
    const page = await vault.createPage({ title: 'Before', content: 'stable body' })
    await reindex()

    fs.renameSync(path.join(root, 'Before.md'), path.join(root, 'After.md'))
    const changes = await applyBatch(['Before.md', 'After.md'])

    expect(changes).toEqual([
      { kind: 'moved', pageId: page.id, relativePath: 'After.md', previousPath: 'Before.md' },
    ])
    expect((await vault.getPage(page.id))!.title).toBe('After')
  })

  it('drops a note from the index when its file is deleted outside the app', async () => {
    await vault.createPage({ title: 'Doomed', content: 'findable text' })
    await reindex()
    expect(searchNotes(db, 'findable')).toHaveLength(1)

    fs.rmSync(path.join(root, 'Doomed.md'))
    await applyBatch(['Doomed.md'])
    await reindex()

    expect(searchNotes(db, 'findable')).toEqual([])
  })

  it('says nothing about a file that was touched but not changed', async () => {
    await vault.createPage({ title: 'Untouched', content: 'body' })
    await reindex()
    expect(await applyBatch(['Untouched.md'])).toEqual([])
  })
})

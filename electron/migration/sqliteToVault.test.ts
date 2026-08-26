/**
 * The migration end to end, against a real SQLite workspace and a real
 * directory — the only way to test it that means anything, since every bug
 * worth catching lives in the seam between the two.
 *
 * The Electron fake is the same trick `sqliteNoteRepository.test.ts` uses:
 * `workspaceDb` resolves its path from `app.getPath` at import time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { DATA_DIR } = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'prism-migrate-data-')) }
})

vi.mock('electron', () => ({
  app: { getPath: () => DATA_DIR, getName: () => 'PrismMD' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {} },
  dialog: {},
  shell: {},
}))

import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { SqliteNoteRepository } from '../repositories/sqliteNoteRepository'
import { MarkdownVaultRepository } from '../vault/markdownVaultRepository'
import { parseNote } from '../vault/frontmatter'
import { closeDb, getDb } from '../services/workspaceDb'
import { saveAssetFromBytes } from '../services/assetService'
import { migrateSqliteToVault } from './sqliteToVault'
import { readJournal } from './migrationJournal'

let source: SqliteNoteRepository
let workArea: string
let target: string
const scratchDbs: Database.Database[] = []

function resetDatabase(): void {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(DATA_DIR, `workspace.db${suffix}`), { force: true })
  }
  fs.rmSync(path.join(DATA_DIR, 'assets'), { recursive: true, force: true })
}

beforeEach(() => {
  resetDatabase()
  source = new SqliteNoteRepository()
  workArea = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-migrate-')))
  target = path.join(workArea, 'Vault')
})

afterEach(() => {
  for (const db of scratchDbs.splice(0)) db.close()
  closeDb()
  fs.rmSync(workArea, { recursive: true, force: true })
})

async function readBytes(pageId: string): Promise<Uint8Array | null> {
  return source.readPageBytes(pageId)
}

function openVault(root: string): MarkdownVaultRepository {
  const db = new Database(':memory:')
  scratchDbs.push(db)
  return new MarkdownVaultRepository({ root, db })
}

const migrate = () => migrateSqliteToVault({ targetPath: target, source, readBytes })

describe('migrateSqliteToVault', () => {
  it('moves every note into the vault with its content intact', async () => {
    await source.createPage({ title: 'Alpha', content: '# Alpha\n\nfirst\n' })
    await source.createPage({ title: 'Bravo', content: '# Bravo\n\nsecond\n' })

    const result = await migrate()
    expect(result.ok).toBe(true)
    expect(result.report!.counts).toMatchObject({ notesBefore: 2, notesAfter: 2 })

    expect(fs.readFileSync(path.join(target, 'Alpha.md'), 'utf-8')).toContain('first')
    expect(fs.readFileSync(path.join(target, 'Bravo.md'), 'utf-8')).toContain('second')
  })

  it('carries page ids across, so everything keyed by id keeps working', async () => {
    // ★ annotations, page_versions, page_meta, doc_summaries and muse_cards
    // are all keyed by page id. Generating fresh ids here would orphan every
    // one of those tables without a single error being raised.
    const page = await source.createPage({ title: 'Annotated', content: 'body' })
    await migrate()

    const written = fs.readFileSync(path.join(target, 'Annotated.md'), 'utf-8')
    expect(parseNote(written).frontmatter.id).toBe(page.id)
    expect((await openVault(target).getPage(page.id))!.content).toBe('body')
  })

  it('recreates the folder tree, including folders holding no notes', async () => {
    const outer = await source.createFolder({ title: 'Projects' })
    const inner = await source.createFolder({ title: 'Deep', parentId: outer.id })
    await source.createFolder({ title: 'Empty', parentId: outer.id })
    await source.createPage({ title: 'Nested', parentId: inner.id, content: 'x' })

    expect((await migrate()).ok).toBe(true)
    expect(fs.statSync(path.join(target, 'Projects', 'Deep')).isDirectory()).toBe(true)
    // An empty folder is still something the user made.
    expect(fs.statSync(path.join(target, 'Projects', 'Empty')).isDirectory()).toBe(true)
    expect(fs.existsSync(path.join(target, 'Projects', 'Deep', 'Nested.md'))).toBe(true)
  })

  it('keeps a title the filesystem cannot express', async () => {
    const page = await source.createPage({ title: 'Q1/Q2 plan', content: 'x' })
    expect((await migrate()).ok).toBe(true)

    expect(fs.existsSync(path.join(target, 'Q1 Q2 plan.md'))).toBe(true)
    expect((await openVault(target).getPage(page.id))!.title).toBe('Q1/Q2 plan')
  })

  it('keeps two same-titled notes as two files', async () => {
    const first = await source.createPage({ title: 'Untitled', content: 'first' })
    const second = await source.createPage({ title: 'Untitled', content: 'second' })

    expect((await migrate()).ok).toBe(true)
    const vault = openVault(target)
    expect((await vault.getPage(first.id))!.content).toBe('first')
    expect((await vault.getPage(second.id))!.content).toBe('second')
  })

  it('copies a binary document byte-for-byte', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0xff])
    const page = await source.importDroppedFile('Paper.pdf', bytes, null)
    // The extracted-text backfill the renderer does; it must survive too.
    await source.updatePage(page.id, { content: 'extracted text' })

    const result = await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })

    expect(result.ok).toBe(true)
    expect([...fs.readFileSync(path.join(target, 'Paper.pdf'))]).toEqual([...bytes])

    // ★ A PDF's searchable text cannot live inside the PDF, so it travels in
    // the vault's own database — which the migration creates and closes
    // before the swap. Without this the document arrives unsearchable and
    // nothing says so.
    const db = new Database(path.join(target, '.prism', 'prism.db'))
    scratchDbs.push(db)
    const vault = new MarkdownVaultRepository({ root: target, db })
    await vault.scan()
    expect((await vault.getPage(page.id))!.content).toBe('extracted text')
  })

  it('preserves wiki links and the notes they resolve to', async () => {
    await source.createPage({ title: 'Kalman Filter', content: 'theory' })
    await source.createPage({ title: 'Reading', content: 'see [[Kalman Filter]] #inbox' })

    const result = await migrate()
    expect(result.ok).toBe(true)
    expect(result.report!.counts.resolvedLinksAfter).toBe(result.report!.counts.resolvedLinksBefore)
    expect(result.report!.counts.tagsAfter).toBe(1)
  })

  it('carries sibling order and icons into the sidecar', async () => {
    const second = await source.createPage({ title: 'Zeta', content: 'x' })
    const first = await source.createPage({ title: 'Alpha', content: 'x' })
    await source.movePage(second.id, null, 0)
    await source.movePage(first.id, null, 1)
    await source.updatePage(second.id, { icon: '📓' })

    expect((await migrate()).ok).toBe(true)
    const vault = openVault(target)
    // Order survived: Zeta before Alpha, which alphabetical sorting would not do.
    expect((await vault.getChildren(null)).map((p) => p.title)).toEqual(['Zeta', 'Alpha'])
    expect((await vault.getPage(second.id))!.icon).toBe('📓')
  })

  it('leaves the source workspace untouched', async () => {
    // ★ Rule one: nothing is destroyed. If the migration were deleted
    // mid-run the workspace would be exactly as it was.
    const page = await source.createPage({ title: 'Original', content: 'still here' })
    await migrate()

    expect((await source.getPage(page.id))!.content).toBe('still here')
    expect(await source.countPages()).toBe(1)
  })

  it('writes a backup before touching anything', async () => {
    await source.createPage({ title: 'A', content: 'x' })
    const backupDir = path.join(workArea, 'backups')

    const result = await migrateSqliteToVault({
      targetPath: target,
      source,
      readBytes,
      backupDir,
      backupFiles: [path.join(DATA_DIR, 'workspace.db')],
    })

    expect(result.ok).toBe(true)
    const dumps = fs.readdirSync(backupDir)
    expect(dumps).toHaveLength(1)
    expect(fs.existsSync(path.join(backupDir, dumps[0], 'workspace.db'))).toBe(true)
  })

  it('migrates an empty workspace without complaint', async () => {
    const result = await migrate()
    expect(result.ok).toBe(true)
    expect(result.report!.counts.notesAfter).toBe(0)
  })

  it('refuses to migrate into a folder that already exists', async () => {
    fs.mkdirSync(target, { recursive: true })
    const result = await migrate()
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/existing folder/)
  })

  it('leaves no journal behind after a successful migration', async () => {
    // A journal that travelled into the finished vault would make a completed
    // migration look interrupted forever.
    await source.createPage({ title: 'A', content: 'x' })
    expect((await migrate()).ok).toBe(true)
    expect(fs.existsSync(path.join(target, '.prism', 'migration.json'))).toBe(false)
  })

  it('leaves no staging directory behind on success', async () => {
    await source.createPage({ title: 'A', content: 'x' })
    expect((await migrate()).ok).toBe(true)
    expect(fs.readdirSync(workArea)).toEqual(['Vault'])
  })

  it('produces a vault that rebuilds from its files alone', async () => {
    await source.createPage({ title: 'Durable', content: '# Durable\n\nbody\n' })
    const folder = await source.createFolder({ title: 'Box' })
    await source.createPage({ title: 'Inside', parentId: folder.id, content: 'nested' })

    expect((await migrate()).ok).toBe(true)

    // A fresh catalog over the same directory has to see the same workspace.
    const rebuilt = openVault(target)
    await rebuilt.scan({ force: true })
    const titles = (await rebuilt.listPages()).map((p) => p.title).sort()
    expect(titles).toEqual(['Durable', 'Inside'])
  })
})

describe('migrateSqliteToVault: refusing to sign off', () => {
  /**
   * Simulates a write that silently did not land — a permission error
   * swallowed by a `catch`, a sync client eating a file, a bug in a future
   * refactor of the write loop. The note is removed from staging after the
   * writer reports it done and before validation reads it back.
   */
  async function migrateLosingOneNote(losing: string) {
    let staging: string | null = null
    return migrateSqliteToVault({
      targetPath: target,
      source,
      readBytes,
      onProgress: ({ done, total }) => {
        if (done !== total) return
        staging = path.join(workArea, '.Vault.migrating')
        fs.rmSync(path.join(staging, losing), { force: true })
      },
    })
  }

  it('does not swap, and keeps the staging directory, when validation fails', async () => {
    // ★ The single most important behaviour in this file. A migration that
    // cannot prove itself must leave the user exactly where they started,
    // with the evidence still on disk.
    await source.createPage({ title: 'Kept', content: 'x' })
    await source.createPage({ title: 'Lost', content: 'y' })

    const result = await migrateLosingOneNote('Lost.md')

    expect(result.ok).toBe(false)
    expect(result.report!.problems.some((p) => p.code === 'note.missing')).toBe(true)
    expect(fs.existsSync(target)).toBe(false)
    expect(fs.existsSync(result.stagingPath!)).toBe(true)
    // The surviving note is still there to look at.
    expect(fs.existsSync(path.join(result.stagingPath!, 'Kept.md'))).toBe(true)
  })

  it('leaves the source workspace usable after a failed migration', async () => {
    const page = await source.createPage({ title: 'Lost', content: 'precious' })
    await source.createPage({ title: 'Kept', content: 'x' })

    expect((await migrateLosingOneNote('Lost.md')).ok).toBe(false)
    expect((await source.getPage(page.id))!.content).toBe('precious')
    expect(await source.countPages()).toBe(2)
  })

  it('records the failure in the journal, so the leftovers are legible', async () => {
    await source.createPage({ title: 'Lost', content: 'y' })
    const result = await migrateLosingOneNote('Lost.md')

    const journal = readJournal(path.join(result.stagingPath!, '.prism', 'migration.json'))
    expect(journal).not.toBeNull()
    expect(journal!.step).toBe('failed')
    expect(journal!.error).toContain('did not arrive')
    expect(journal!.sourceNoteCount).toBe(1)
  })
})

describe('migrateSqliteToVault: highlights', () => {
  it('copies annotations into the vault, so a backup of the folder has them', async () => {
    // ★ Someone who backs up the vault folder reasonably believes they have
    // backed up their highlights. Leaving them in the app database means the
    // folder that looks like "all my notes" silently is not.
    const page = await source.createPage({ title: 'Annotated', content: 'a passage worth marking' })
    // Rows written straight into the table the migration reads. Going through
    // annotationStore would test its backend dispatch instead, and drag
    // electron-store into a suite that has no Electron.
    getDb().prepare(`
      INSERT INTO annotations
        (id, page_id, start_offset, end_offset, selected_text, color, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('a1', page.id, 2, 9, 'passage', 'yellow', 'a thought', '2026-08-25T10:00:00.000Z', '2026-08-25T10:00:00.000Z')

    const result = await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })
    expect(result.ok).toBe(true)

    const sidecar = path.join(target, '.prism', 'annotations', `${encodeURIComponent(page.id)}.json`)
    const stored = JSON.parse(fs.readFileSync(sidecar, 'utf-8'))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ selectedText: 'passage', note: 'a thought' })
  })

  it('carries editorial metadata into front matter', async () => {
    // ★ `page_meta` has no destination table in a vault — these three become
    // front matter. A migration that dropped them would quietly un-classify
    // every note the user had ever marked.
    const page = await source.createPage({ title: 'Judged', content: 'body' })
    getDb().prepare(
      'INSERT INTO page_meta (page_id, status, genre, quality, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(page.id, 'done', 'tech', 4, Date.now())

    expect((await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })).ok).toBe(true)

    const raw = fs.readFileSync(path.join(target, 'Judged.md'), 'utf-8')
    expect(parseNote(raw).frontmatter).toMatchObject({
      status: 'done', genre: 'tech', quality: '4',
    })
    // Unquoted, so other Markdown tools sort it as a number.
    expect(raw).toContain('quality: 4')
  })

  it('carries snapshot history into .prism/versions', async () => {
    // ★ Before the vault had a database of its own, these rows simply stayed
    // in `workspace.db` and kept working. Now the vault starts with an empty
    // database, so not copying them means losing every snapshot silently.
    const page = await source.createPage({ title: 'Rewritten', content: 'new text' })
    getDb().prepare(
      'INSERT INTO page_versions (id, page_id, content, title, source, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('v1', page.id, 'old text', 'Rewritten', 'round-table', 'before the rewrite', 1000)

    expect((await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })).ok).toBe(true)

    const dir = path.join(target, '.prism', 'versions', encodeURIComponent(page.id))
    const [file] = fs.readdirSync(dir)
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
    expect(raw).toContain('old text')
    expect(raw).toContain('prism-source: "round-table"')
    expect(raw).toContain('prism-label: "before the rewrite"')
  })

  it('carries AI summaries into the vault database', async () => {
    const page = await source.createPage({ title: 'Summarised', content: 'body' })
    getDb().prepare(
      'INSERT INTO doc_summaries (page_id, tldr, questions, generated_at, signature) VALUES (?, ?, ?, ?, ?)',
    ).run(page.id, 'the short version', '[]', 1000, 'sig')

    expect((await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })).ok).toBe(true)

    const db = new Database(path.join(target, '.prism', 'prism.db'))
    scratchDbs.push(db)
    expect(db.prepare('SELECT tldr FROM doc_summaries WHERE page_id = ?').get(page.id))
      .toEqual({ tldr: 'the short version' })
  })

  it('leaves no open handle inside the staging directory', async () => {
    // The staging directory is renamed into place; on Windows an open
    // database handle inside it fails that rename outright.
    await source.createPage({ title: 'Plain', content: 'x' })
    const result = await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })
    expect(result.ok).toBe(true)
    expect(fs.existsSync(path.join(target, '.prism', 'prism.db'))).toBe(true)
    expect(fs.existsSync(`${target}.migrating`)).toBe(false)
  })

  it('writes no annotations directory when there are none', async () => {
    await source.createPage({ title: 'Plain', content: 'x' })
    expect((await migrateSqliteToVault({
      targetPath: target, source, readBytes, sourceDb: getDb(),
    })).ok).toBe(true)
    expect(fs.existsSync(path.join(target, '.prism', 'annotations'))).toBe(false)
  })
})

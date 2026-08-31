/**
 * The wiring, not the pieces.
 *
 * ★ Stage 4's real bug was not in the index and not in the vault — it was in
 * the seam between them, where each half was tested and the pair was not.
 * Stage 5 has four more seams of exactly that shape: version history,
 * editorial metadata, AI summaries and muse cards each pick a destination
 * from the active storage mode, and each of them was, until now, writing into
 * a table whose foreign key rejected every vault note id without a word.
 *
 * So these tests go through the *services* the IPC handlers call, with the
 * repository actually switched over, and assert what ends up on disk.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { DATA_DIR } = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'prism-scoped-data-')) }
})

vi.mock('electron', () => ({
  app: { getPath: () => DATA_DIR, getName: () => 'PrismMD' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {} },
  dialog: {},
  shell: {},
}))

let vaultPathForSettings: string | null = null
vi.mock('./settingsStore', () => ({
  getStorageSettings: () => ({
    mode: vaultPathForSettings ? 'vault' : 'sqlite',
    vaultPath: vaultPathForSettings,
    migratedAt: null,
  }),
  setStorageSettings: () => {},
}))

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { MarkdownVaultRepository } from '../vault/markdownVaultRepository'
import { SqliteNoteRepository } from '../repositories/sqliteNoteRepository'
import { setNoteRepository } from '../repositories/repositoryFactory'
import { parseNote } from '../vault/frontmatter'
import { closeDb, getDb } from './workspaceDb'
import { closeIndexDatabase, indexDb, openIndexDatabase } from './indexDatabase'
import { deleteVersion, getVersion, listVersions, saveVersion } from './versionService'
import { getPageMeta, listPageMeta, setPageMeta } from './pageMetaService'
import { setDocSummary, getDocSummary } from './docSummaryService'
import { addMuseCard, listMuseCards } from './museService'

let root: string

async function useVault(): Promise<MarkdownVaultRepository> {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-scoped-vault-')))
  vaultPathForSettings = root
  const repo = new MarkdownVaultRepository({ root, db: openIndexDatabase(root) })
  await repo.scan()
  setNoteRepository(repo)
  return repo
}

function useSqlite(): SqliteNoteRepository {
  vaultPathForSettings = null
  closeIndexDatabase()
  const repo = new SqliteNoteRepository()
  setNoteRepository(repo)
  return repo
}

beforeEach(() => {
  closeDb()
  closeIndexDatabase()
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(DATA_DIR, `workspace.db${suffix}`), { force: true })
  }
  vaultPathForSettings = null
})

afterEach(() => {
  closeIndexDatabase()
  closeDb()
  setNoteRepository(null)
  if (root) fs.rmSync(root, { recursive: true, force: true })
  root = ''
})

describe('version history follows the storage mode', () => {
  it('writes snapshots into the vault, not the database', async () => {
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Rewritten', content: 'new text' })

    const meta = await saveVersion(page.id, 'old text', { title: 'Rewritten', source: 'manual' })

    const dir = path.join(root, '.prism', 'versions', encodeURIComponent(page.id))
    expect(fs.readdirSync(dir)).toHaveLength(1)
    expect((await getVersion(meta.id, page.id))!.content).toBe('old text')
    // ★ Nothing landed in the database — which is the point. Before this it
    // could not have: the insert was rejected by a foreign key to `pages`.
    expect(indexDb().prepare('SELECT COUNT(*) AS n FROM page_versions').get()).toEqual({ n: 0 })
  })

  it('lists and deletes a vault snapshot', async () => {
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Note', content: 'x' })
    const first = await saveVersion(page.id, 'one')
    const second = await saveVersion(page.id, 'two')

    expect((await listVersions(page.id)).map((item) => item.id).sort())
      .toEqual([first.id, second.id].sort())

    await deleteVersion(first.id, page.id)
    expect((await listVersions(page.id)).map((item) => item.id)).toEqual([second.id])
  })

  it('finds a vault snapshot even when the caller does not know the note', async () => {
    // The older IPC signature carried only a version id, and it is still
    // accepted; the fast path is an optimisation, not a requirement.
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Note', content: 'x' })
    const saved = await saveVersion(page.id, 'body')
    expect((await getVersion(saved.id))!.content).toBe('body')
  })

  it('still uses the database when the notes are in one', async () => {
    const repo = useSqlite()
    const page = await repo.createPage({ title: 'Note', content: 'x' })
    const saved = await saveVersion(page.id, 'old text')

    expect((await getVersion(saved.id))!.content).toBe('old text')
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM page_versions').get()).toEqual({ n: 1 })
  })
})

describe('editorial metadata follows the storage mode', () => {
  it('writes status, genre and quality into the note file', async () => {
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Judged', content: 'body' })

    await setPageMeta(page.id, { status: 'done', genre: 'tech', quality: 4 })

    const raw = fs.readFileSync(path.join(root, 'Judged.md'), 'utf-8')
    expect(parseNote(raw).frontmatter).toMatchObject({ status: 'done', genre: 'tech' })
    expect(parseNote(raw).body).toContain('body')
    expect(await getPageMeta(page.id)).toEqual({ status: 'done', genre: 'tech', quality: 4 })
  })

  it('reads a status set by another Markdown tool', async () => {
    // ★ The reason this is front matter and not a sidecar: the same field
    // other editors already use means classifying a note in Obsidian shows
    // up on the shelf here.
    const repo = await useVault()
    const page = await repo.createPage({ title: 'External', content: 'body' })
    const file = path.join(root, 'External.md')
    const raw = fs.readFileSync(file, 'utf-8')
    fs.writeFileSync(file, raw.replace(/^---\n/, '---\nstatus: revise\n'), 'utf-8')

    expect((await getPageMeta(page.id))?.status).toBe('revise')
  })

  it('lists every note in the vault for the shelf', async () => {
    const repo = await useVault()
    const judged = await repo.createPage({ title: 'Judged', content: 'body' })
    await repo.createPage({ title: 'Plain', content: 'other' })
    await setPageMeta(judged.id, { status: 'hot' })

    const list = await listPageMeta()
    expect(list).toHaveLength(2)
    expect(list.find((item) => item.pageId === judged.id)?.status).toBe('hot')
  })
})

describe('the old store is read-only once the notes are files', () => {
  it('writes nothing into pages while working in a vault', async () => {
    // ★ "`pages.content` 停写" — the first half of stage 5. The table stays
    // behind as the archive of what the workspace was, and the only way to
    // be sure of that is to exercise the write paths and then look.
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Everything', content: 'body' })
    await repo.updatePage(page.id, { content: 'edited' })
    await repo.renamePage(page.id, 'Renamed')
    await saveVersion(page.id, 'snapshot')
    await setPageMeta(page.id, { status: 'done' })
    await setDocSummary(page.id, {
      tldr: 'x', questions: [], generatedAt: 1, signature: 's',
    })
    await repo.deletePage(page.id)

    expect(getDb().prepare('SELECT COUNT(*) AS n FROM pages').get()).toEqual({ n: 0 })
  })
})

describe('AI caches accept a note that is a file', () => {
  it('saves and reads a doc summary for a vault note', async () => {
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Long', content: 'body' })

    await setDocSummary(page.id, {
      tldr: 'the short version', questions: ['why?'], generatedAt: 1000, signature: 'sig',
    })
    expect((await getDocSummary(page.id))?.tldr).toBe('the short version')
  })

  it('adds a muse card pointing at a vault note', async () => {
    const repo = await useVault()
    const page = await repo.createPage({ title: 'Quoted', content: 'body' })

    addMuseCard('quote', 'a line worth keeping', page.id)
    expect(listMuseCards()).toHaveLength(1)
  })
})

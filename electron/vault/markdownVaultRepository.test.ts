/**
 * The vault backend against the *same* contract the SQLite backend passes,
 * plus the assertions that only make sense when notes are files.
 *
 * ★ No Electron here at all — the repository takes its root and its database
 * by injection, which is what the stage-1 interface was shaped for. That the
 * suite runs against a temp directory in plain node is the whole payoff.
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describeNoteRepository } from '../repositories/contract'
import { MarkdownVaultRepository } from './markdownVaultRepository'
import { parseNote } from './frontmatter'

const open: { db: Database.Database; root: string }[] = []

function newVault(): MarkdownVaultRepository {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-vault-')))
  const db = new Database(':memory:')
  open.push({ db, root })
  return new MarkdownVaultRepository({ root, db })
}

afterEach(() => {
  for (const { db, root } of open.splice(0)) {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describeNoteRepository('MarkdownVaultRepository', { create: async () => newVault() })

// ── Vault-specific behaviour ────────────────────────────────────────────────

describe('MarkdownVaultRepository: files on disk', () => {
  let root: string
  let repo: MarkdownVaultRepository

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-vault-fs-')))
    const db = new Database(':memory:')
    open.push({ db, root })
    repo = new MarkdownVaultRepository({ root, db })
  })

  const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf-8')
  const exists = (relative: string) => fs.existsSync(path.join(root, relative))

  it('writes a note as a readable Markdown file named after its title', async () => {
    await repo.createPage({ title: 'Kalman Filter', content: '# Kalman\n\nbody\n' })
    expect(exists('Kalman Filter.md')).toBe(true)
    expect(read('Kalman Filter.md')).toContain('# Kalman\n\nbody\n')
  })

  it('stamps a stable id into front matter', async () => {
    const page = await repo.createPage({ title: 'Note', content: 'body' })
    expect(parseNote(read('Note.md')).frontmatter.id).toBe(page.id)
  })

  it('does not repeat the title in front matter when the filename already says it', async () => {
    await repo.createPage({ title: 'Plain Title', content: 'body' })
    expect(parseNote(read('Plain Title.md')).frontmatter.title).toBeUndefined()
  })

  it('records the title in front matter when the filename cannot express it', async () => {
    // `/` cannot be in a filename, so the file is `a b.md` and the real title
    // has to be written down or it is lost.
    const page = await repo.createPage({ title: 'a/b', content: 'body' })
    expect(exists('a b.md')).toBe(true)
    expect(parseNote(read('a b.md')).frontmatter.title).toBe('a/b')
    expect((await repo.getPage(page.id))!.title).toBe('a/b')
  })

  it('keeps the body free of front matter, so what you edit is what you wrote', async () => {
    const page = await repo.createPage({ title: 'Note', content: '# Body only\n' })
    expect((await repo.getPage(page.id))!.content).toBe('# Body only\n')
  })

  it('makes a folder a real directory', async () => {
    await repo.createFolder({ title: 'Projects' })
    expect(fs.statSync(path.join(root, 'Projects')).isDirectory()).toBe(true)
  })

  it('puts a nested note in the matching subdirectory', async () => {
    const folder = await repo.createFolder({ title: 'Projects' })
    await repo.createPage({ title: 'PrismMD', parentId: folder.id, content: 'x' })
    expect(exists(path.join('Projects', 'PrismMD.md'))).toBe(true)
  })

  it('renames the file when the note is renamed', async () => {
    const page = await repo.createPage({ title: 'Before', content: 'body' })
    await repo.renamePage(page.id, 'After')
    expect(exists('Before.md')).toBe(false)
    expect(exists('After.md')).toBe(true)
    expect(read('After.md')).toContain('body')
  })

  it('keeps a note\'s id across a rename and a move', async () => {
    // ★ Identity lives in the file, not in its path. Everything hanging off a
    // note — backlinks, annotations, history — depends on this holding.
    const folder = await repo.createFolder({ title: 'Projects' })
    const page = await repo.createPage({ title: 'Wanderer', content: 'body' })

    await repo.renamePage(page.id, 'Renamed')
    await repo.movePage(page.id, folder.id, 0)

    const moved = await repo.getPage(page.id)
    expect(moved!.id).toBe(page.id)
    expect(moved!.content).toBe('body')
    expect(exists(path.join('Projects', 'Renamed.md'))).toBe(true)
  })

  it('moves a deleted note into .trash rather than unlinking it', async () => {
    const page = await repo.createPage({ title: 'Doomed', content: 'precious' })
    await repo.deletePage(page.id)

    expect(exists('Doomed.md')).toBe(false)
    const trashed = path.join(root, '.trash', encodeURIComponent(page.id), 'Doomed.md')
    expect(fs.readFileSync(trashed, 'utf-8')).toContain('precious')
  })

  it('restores a note to where it came from', async () => {
    const folder = await repo.createFolder({ title: 'Projects' })
    const page = await repo.createPage({ title: 'Doomed', parentId: folder.id, content: 'x' })

    await repo.deletePage(page.id)
    await repo.restorePage(page.id)
    expect(exists(path.join('Projects', 'Doomed.md'))).toBe(true)
  })

  it('does not overwrite a note that took the deleted one\'s place', async () => {
    const page = await repo.createPage({ title: 'Shared', content: 'original' })
    await repo.deletePage(page.id)
    await repo.createPage({ title: 'Shared', content: 'the new occupant' })

    await repo.restorePage(page.id)
    expect(read('Shared.md')).toContain('the new occupant')
    expect(read('Shared 2.md')).toContain('original')
  })

  it('preserves front matter it does not understand across an edit', async () => {
    // ★ The vault is meant to be shared with Obsidian. An edit made here must
    // not cost the user a field PrismMD has never heard of.
    const page = await repo.createPage({ title: 'Shared note', content: 'body' })
    const withExtras = read('Shared note.md').replace(
      '---\n',
      '---\naliases:\n  - Other name\ncssclass: wide\n',
    )
    fs.writeFileSync(path.join(root, 'Shared note.md'), withExtras)

    await repo.updatePage(page.id, { content: 'edited body' })
    const after = read('Shared note.md')
    expect(after).toContain('aliases:\n  - Other name')
    expect(after).toContain('cssclass: wide')
    expect(after).toContain('edited body')
  })

  it('adopts a file dropped into the vault by another tool', async () => {
    fs.writeFileSync(path.join(root, 'From Obsidian.md'), '# Hi\n\ntheir note\n')
    const pages = await repo.listPages()

    const adopted = pages.find((p) => p.title === 'From Obsidian')
    expect(adopted).toBeDefined()
    expect(adopted!.content).toContain('their note')
    // It gains an id so a later move can still be recognised as the same note.
    expect(parseNote(read('From Obsidian.md')).frontmatter.id).toBe(adopted!.id)
  })

  it('recognises a note moved externally as the same note', async () => {
    const page = await repo.createPage({ title: 'Travels', content: 'body' })
    fs.mkdirSync(path.join(root, 'Elsewhere'))
    fs.renameSync(path.join(root, 'Travels.md'), path.join(root, 'Elsewhere', 'Travels.md'))

    await repo.scan()
    const found = await repo.getPage(page.id)
    expect(found).not.toBeNull()
    expect(found!.parentId).toBe('dir:Elsewhere')
  })

  it('ignores .prism, .trash and other tools\' directories', async () => {
    fs.mkdirSync(path.join(root, '.obsidian'), { recursive: true })
    fs.writeFileSync(path.join(root, '.obsidian', 'workspace.md'), 'not a note')
    fs.mkdirSync(path.join(root, '.trash', 'x'), { recursive: true })
    fs.writeFileSync(path.join(root, '.trash', 'x', 'gone.md'), 'deleted')

    expect((await repo.listPages()).map((p) => p.title)).toEqual([])
  })

  it('ignores file types it cannot render', async () => {
    fs.writeFileSync(path.join(root, 'binary.exe'), 'nope')
    expect((await repo.listPages()).map((p) => p.title)).toEqual([])
  })

  it('leaves no temp files behind, and sweeps stale ones', async () => {
    fs.writeFileSync(path.join(root, '.orphan.md.abc.prism-tmp'), 'partial')
    await repo.createPage({ title: 'Note', content: 'body' })
    await repo.scan()
    expect(fs.readdirSync(root).filter((n) => n.endsWith('.prism-tmp'))).toEqual([])
  })

  it('survives a corrupt sidecar rather than failing to open', async () => {
    fs.mkdirSync(path.join(root, '.prism'), { recursive: true })
    fs.writeFileSync(path.join(root, '.prism', 'ui.json'), '{ not json')
    const page = await repo.createPage({ title: 'Note', content: 'body' })
    expect((await repo.getPage(page.id))!.title).toBe('Note')
  })

  it('keeps sibling order across a restart, and falls back to names without it', async () => {
    const a = await repo.createPage({ title: 'B first', content: 'x' })
    const b = await repo.createPage({ title: 'A second', content: 'x' })
    await repo.movePage(a.id, null, 0)
    await repo.movePage(b.id, null, 1)
    expect((await repo.getChildren(null)).map((p) => p.title)).toEqual(['B first', 'A second'])

    // The sidecar is losable by design: without it, ordering is alphabetical
    // and nothing else changes.
    fs.rmSync(path.join(root, '.prism', 'ui.json'), { force: true })
    const db = new Database(':memory:')
    open.push({ db, root })
    const reopened = new MarkdownVaultRepository({ root, db })
    expect((await reopened.getChildren(null)).map((p) => p.title)).toEqual(['A second', 'B first'])
  })

  it('refuses to move a folder into itself', async () => {
    const outer = await repo.createFolder({ title: 'Outer' })
    const inner = await repo.createFolder({ title: 'Inner', parentId: outer.id })
    await expect(repo.movePage(outer.id, inner.id, 0)).rejects.toThrow(/into itself/)
  })

  it('rebuilds everything from the files alone', async () => {
    // ★ The catalog is a cache. Throwing it away and starting over must lose
    // nothing, because the files are the truth.
    const page = await repo.createPage({ title: 'Durable', content: 'body' })
    const db = new Database(':memory:')
    open.push({ db, root })
    const rebuilt = new MarkdownVaultRepository({ root, db })

    await rebuilt.scan({ force: true })
    const found = await rebuilt.getPage(page.id)
    expect(found!.title).toBe('Durable')
    expect(found!.content).toBe('body')
  })
})

describe('MarkdownVaultRepository: identity is never lost', () => {
  let root: string
  let repo: MarkdownVaultRepository

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-vault-id-')))
    const db = new Database(':memory:')
    open.push({ db, root })
    repo = new MarkdownVaultRepository({ root, db })
  })

  it('re-stamps the id when a save finds no front matter to preserve', async () => {
    // ★ A note that loses its id loses its backlinks and its annotations, and
    // nothing about the file afterwards would look wrong.
    const page = await repo.createPage({ title: 'Fragile', content: 'body' })
    fs.writeFileSync(path.join(root, 'Fragile.md'), 'someone stripped the front matter')

    await repo.updatePage(page.id, { content: 'edited' })
    expect(parseNote(fs.readFileSync(path.join(root, 'Fragile.md'), 'utf-8')).frontmatter.id)
      .toBe(page.id)
    expect((await repo.getPage(page.id))!.content).toBe('edited')
  })

  it('clears a restored folder\'s descendants from the trash record', async () => {
    const folder = await repo.createFolder({ title: 'Box' })
    const child = await repo.createPage({ title: 'Inside', parentId: folder.id, content: 'x' })

    await repo.deletePage(folder.id)
    await repo.restorePage(folder.id)

    expect((await repo.getPage(child.id))!.content).toBe('x')
    // A second restore must not resurrect a stale record and move the note
    // somewhere it no longer belongs.
    await repo.restorePage(child.id)
    expect((await repo.getPage(child.id))!.parentId).toBe('dir:Box')
  })
})

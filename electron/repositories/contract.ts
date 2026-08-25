/**
 * The behaviour every `NoteRepository` implementation must have, written once
 * and run against each of them.
 *
 * ★ This file is the actual deliverable of the storage abstraction. An
 * interface only promises that two implementations have the same *method
 * names*; it says nothing about whether renaming a note rewrites the links
 * into it, or whether a deleted note disappears from the index's source list.
 * Those are the things that would silently differ between the SQLite backend
 * and the Markdown-vault one, and "silently differ" in a storage layer means
 * losing someone's notes. Two implementations green on one set of assertions
 * is the only evidence that swapping them is safe.
 *
 * Deliberately *not* asserted, because they are backend-specific rather than
 * contractual: exact `position` values (a directory has no ordering of its
 * own), `createdAt`/`updatedAt` resolution, and id format.
 *
 * Named `contract.ts`, not `contract.test.ts`, so vitest does not collect it
 * on its own — it has no tests until an implementation supplies them.
 */
import { describe, expect, it } from 'vitest'
import type { NoteRepository } from './noteRepository'

export interface RepositoryHarness {
  /** A repository over storage that is empty and isolated per test. */
  create(): Promise<NoteRepository>
}

export function describeNoteRepository(label: string, harness: RepositoryHarness): void {
  describe(`NoteRepository contract: ${label}`, () => {
    async function fresh() {
      return harness.create()
    }

    describe('create and read', () => {
      it('round-trips a note', async () => {
        const repo = await fresh()
        const created = await repo.createPage({ title: 'Kalman Filter', content: '# Kalman\n\nbody' })

        const read = await repo.getPage(created.id)
        expect(read).not.toBeNull()
        expect(read!.title).toBe('Kalman Filter')
        expect(read!.content).toBe('# Kalman\n\nbody')
        expect(read!.isFolder).toBe(false)
      })

      it('returns null for an id that does not exist', async () => {
        const repo = await fresh()
        expect(await repo.getPage('nope')).toBeNull()
      })

      it('defaults an untitled, empty note rather than rejecting it', async () => {
        const repo = await fresh()
        const page = await repo.createPage({})
        expect(page.title.length).toBeGreaterThan(0)
        expect(page.content).toBe('')
      })

      it('counts live notes', async () => {
        const repo = await fresh()
        const before = await repo.countPages()
        await repo.createPage({ title: 'A' })
        await repo.createPage({ title: 'B' })
        expect(await repo.countPages()).toBe(before + 2)
      })
    })

    describe('listPages', () => {
      it('returns notes with their text — this is the index\'s only source', async () => {
        const repo = await fresh()
        await repo.createPage({ title: 'A', content: 'alpha' })
        await repo.createPage({ title: 'B', content: 'bravo' })

        const pages = await repo.listPages()
        expect(pages.map((p) => p.content).sort()).toEqual(['alpha', 'bravo'])
      })

      it('excludes folders', async () => {
        const repo = await fresh()
        await repo.createFolder({ title: 'Projects' })
        await repo.createPage({ title: 'A', content: 'alpha' })
        expect((await repo.listPages()).map((p) => p.title)).toEqual(['A'])
      })

      it('excludes deleted notes', async () => {
        const repo = await fresh()
        const doomed = await repo.createPage({ title: 'Doomed', content: 'x' })
        await repo.createPage({ title: 'Kept', content: 'y' })

        await repo.deletePage(doomed.id)
        expect((await repo.listPages()).map((p) => p.title)).toEqual(['Kept'])
      })
    })

    describe('hierarchy', () => {
      it('nests a child under its parent in the tree', async () => {
        const repo = await fresh()
        const folder = await repo.createFolder({ title: 'Projects' })
        const child = await repo.createPage({ title: 'PrismMD', parentId: folder.id })

        const tree = await repo.getTree()
        const node = tree.find((n) => n.id === folder.id)
        expect(node).toBeDefined()
        expect(node!.children.map((c) => c.id)).toContain(child.id)
      })

      it('lists children of a parent, and of the root', async () => {
        const repo = await fresh()
        const folder = await repo.createFolder({ title: 'Projects' })
        const child = await repo.createPage({ title: 'Nested', parentId: folder.id })
        const top = await repo.createPage({ title: 'Top' })

        expect((await repo.getChildren(folder.id)).map((p) => p.id)).toEqual([child.id])
        expect((await repo.getChildren(null)).map((p) => p.id)).toEqual(
          expect.arrayContaining([folder.id, top.id]),
        )
      })

      it('reports ancestors outermost first, ending at the note itself', async () => {
        const repo = await fresh()
        const outer = await repo.createFolder({ title: 'Outer' })
        const inner = await repo.createFolder({ title: 'Inner', parentId: outer.id })
        const leaf = await repo.createPage({ title: 'Leaf', parentId: inner.id })

        expect((await repo.getAncestors(leaf.id)).map((a) => a.title)).toEqual([
          'Outer', 'Inner', 'Leaf',
        ])
      })

      it('moves a note to another parent without changing its identity', async () => {
        const repo = await fresh()
        const from = await repo.createFolder({ title: 'From' })
        const to = await repo.createFolder({ title: 'To' })
        const page = await repo.createPage({ title: 'Wanderer', parentId: from.id, content: 'body' })

        await repo.movePage(page.id, to.id, 0)

        // ★ The id must survive a move. In the vault backend a move is a file
        // rename, and if identity were the path, every move would look like a
        // delete plus a create — losing backlinks, annotations and history.
        const moved = await repo.getPage(page.id)
        expect(moved).not.toBeNull()
        expect(moved!.content).toBe('body')
        expect((await repo.getChildren(to.id)).map((p) => p.id)).toEqual([page.id])
        expect(await repo.getChildren(from.id)).toEqual([])
      })
    })

    describe('updatePage', () => {
      it('writes content', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'A', content: 'before' })
        await repo.updatePage(page.id, { content: 'after' })
        expect((await repo.getPage(page.id))!.content).toBe('after')
      })

      it('writes an icon, and clears it', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'A' })
        await repo.updatePage(page.id, { icon: '📓' })
        expect((await repo.getPage(page.id))!.icon).toBe('📓')
        await repo.updatePage(page.id, { icon: null })
        expect((await repo.getPage(page.id))!.icon).toBeNull()
      })

      it('leaves untouched fields alone', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'Keep me', content: 'body' })
        await repo.updatePage(page.id, { icon: '📓' })
        const after = await repo.getPage(page.id)
        expect(after!.title).toBe('Keep me')
        expect(after!.content).toBe('body')
      })
    })

    describe('renamePage', () => {
      it('changes the title', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'Old', content: 'body' })
        const result = await repo.renamePage(page.id, 'New')
        expect(result.page.title).toBe('New')
        expect((await repo.getPage(page.id))!.title).toBe('New')
      })

      it('rewrites every [[link]] that pointed at the old title', async () => {
        const repo = await fresh()
        const target = await repo.createPage({ title: 'Kalman Filter', content: 'theory' })
        const source = await repo.createPage({
          title: 'Reading list',
          content: 'read [[Kalman Filter]] and [[Kalman Filter#Update|the update step]]',
        })

        const result = await repo.renamePage(target.id, 'Kalman Smoother')

        expect(result.relinked.map((r) => r.pageId)).toEqual([source.id])
        expect((await repo.getPage(source.id))!.content).toBe(
          'read [[Kalman Smoother]] and [[Kalman Smoother#Update|the update step]]',
        )
      })

      it('finds links that were written moments ago', async () => {
        // ★ Regression guard. Rename used to look link sources up in the note
        // index, which is written on a debounce — so a link typed seconds
        // before a rename was invisible to it and quietly broke. Nobody would
        // attribute that to an indexing delay.
        const repo = await fresh()
        const target = await repo.createPage({ title: 'Target', content: 'x' })
        const source = await repo.createPage({ title: 'Source', content: 'see [[Target]]' })

        await repo.renamePage(target.id, 'Renamed')
        expect((await repo.getPage(source.id))!.content).toBe('see [[Renamed]]')
      })

      it('matches links case- and whitespace-insensitively', async () => {
        const repo = await fresh()
        const target = await repo.createPage({ title: 'Kalman Filter', content: 'x' })
        const source = await repo.createPage({ title: 'S', content: 'see [[kalman   filter]]' })

        await repo.renamePage(target.id, 'K')
        expect((await repo.getPage(source.id))!.content).toBe('see [[K]]')
      })

      it('leaves an example inside a code fence alone', async () => {
        const repo = await fresh()
        const target = await repo.createPage({ title: 'Target', content: 'x' })
        const source = await repo.createPage({
          title: 'S',
          content: '```\n[[Target]]\n```\n\nreal [[Target]]',
        })

        await repo.renamePage(target.id, 'Renamed')
        expect((await repo.getPage(source.id))!.content).toBe(
          '```\n[[Target]]\n```\n\nreal [[Renamed]]',
        )
      })

      it('reports nothing relinked when no note links here', async () => {
        const repo = await fresh()
        const target = await repo.createPage({ title: 'Lonely', content: 'x' })
        await repo.createPage({ title: 'Elsewhere', content: 'no links at all' })

        expect((await repo.renamePage(target.id, 'Still lonely')).relinked).toEqual([])
      })

      it('does not rewrite links on a case-only rename, which still resolve', async () => {
        const repo = await fresh()
        const target = await repo.createPage({ title: 'kalman filter', content: 'x' })
        const source = await repo.createPage({ title: 'S', content: 'see [[kalman filter]]' })

        const result = await repo.renamePage(target.id, 'Kalman Filter')
        expect(result.relinked).toEqual([])
        expect((await repo.getPage(source.id))!.content).toBe('see [[kalman filter]]')
      })

      it('rejects a rename of a note that does not exist', async () => {
        const repo = await fresh()
        await expect(repo.renamePage('nope', 'X')).rejects.toThrow()
      })
    })

    describe('delete and restore', () => {
      it('hides a deleted note and brings it back intact', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'Doomed', content: 'precious' })

        await repo.deletePage(page.id)
        expect(await repo.getPage(page.id)).toBeNull()

        await repo.restorePage(page.id)
        const back = await repo.getPage(page.id)
        // ★ Restore has to return the *content*, not just the row. A delete
        // that discards text and a restore that returns an empty note is
        // indistinguishable from working, right up until someone needs it.
        expect(back!.content).toBe('precious')
        expect(back!.title).toBe('Doomed')
      })

      it('deletes descendants along with a folder', async () => {
        const repo = await fresh()
        const folder = await repo.createFolder({ title: 'Doomed folder' })
        const child = await repo.createPage({ title: 'Child', parentId: folder.id })

        await repo.deletePage(folder.id)
        expect(await repo.getPage(child.id)).toBeNull()
      })
    })

    describe('search', () => {
      it('finds a note by a fragment of its title', async () => {
        const repo = await fresh()
        await repo.createPage({ title: 'Scheduler notes', content: 'body' })
        expect((await repo.searchPages('schedul')).map((p) => p.title)).toEqual(['Scheduler notes'])
      })

      it('finds a note by a fragment of its content', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'A', content: 'exponential backoff' })
        expect((await repo.searchPages('backoff')).map((p) => p.id)).toEqual([page.id])
      })

      it('returns nothing rather than everything for a miss', async () => {
        const repo = await fresh()
        await repo.createPage({ title: 'A', content: 'alpha' })
        expect(await repo.searchPages('zzzqqq')).toEqual([])
      })

      it('never returns a deleted note', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'Gone', content: 'x' })
        await repo.deletePage(page.id)
        expect(await repo.searchPages('Gone')).toEqual([])
      })
    })

    describe('import and export', () => {
      it('imports a markdown file, taking its stem as the title', async () => {
        const repo = await fresh()
        const { file, cleanup } = await writeTempFile('Imported note.md', '# Hi\n\nbody\n')
        try {
          const page = await repo.importFile(file, null)
          expect(page.title).toBe('Imported note')
          expect(page.content).toBe('# Hi\n\nbody\n')
        } finally {
          cleanup()
        }
      })

      it('imports bytes handed over from a drag-and-drop', async () => {
        const repo = await fresh()
        const bytes = new TextEncoder().encode('dropped body')
        const page = await repo.importDroppedFile('Dropped.md', bytes, null)
        expect(page.title).toBe('Dropped')
        expect(page.content).toBe('dropped body')
      })

      it('refuses a file type it cannot represent', async () => {
        const repo = await fresh()
        await expect(
          repo.importDroppedFile('thing.exe', new Uint8Array([1, 2]), null),
        ).rejects.toThrow()
      })

      it('writes a note back out to disk', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'Export me', content: '# Exported\n' })
        const { file, cleanup, read } = await writeTempFile('out.md', '')
        try {
          await repo.exportPage(page.id, file)
          expect(read()).toBe('# Exported\n')
        } finally {
          cleanup()
        }
      })

      it('suggests a filename carrying the note\'s real extension', async () => {
        const repo = await fresh()
        const page = await repo.createPage({ title: 'My note', content: '' })
        expect(await repo.exportFileNameFor(page)).toBe('My note.md')
      })
    })

    describe('ensureWelcomePage', () => {
      it('seeds an empty workspace exactly once', async () => {
        const repo = await fresh()
        await repo.ensureWelcomePage()
        const afterFirst = await repo.countPages()
        expect(afterFirst).toBe(1)

        await repo.ensureWelcomePage()
        expect(await repo.countPages()).toBe(afterFirst)
      })

      it('does not seed a workspace that already has notes', async () => {
        const repo = await fresh()
        await repo.createPage({ title: 'Mine', content: 'x' })
        await repo.ensureWelcomePage()
        expect((await repo.listPages()).map((p) => p.title)).toEqual(['Mine'])
      })
    })
  })
}

/** A throwaway file on disk, for the import/export assertions. */
async function writeTempFile(
  name: string,
  contents: string,
): Promise<{ file: string; read: () => string; cleanup: () => void }> {
  const fs = await import('fs')
  const os = await import('os')
  const path = await import('path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-repo-io-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, contents, 'utf-8')
  return {
    file,
    read: () => fs.readFileSync(file, 'utf-8'),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

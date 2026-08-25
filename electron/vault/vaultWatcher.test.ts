import { describe, expect, it } from 'vitest'
import { isWatchable, reconcilePaths, type ReconcileContext } from './vaultWatcher'
import { classifyConflict, conflictCopyTitle } from './conflictResolver'

/** A stand-in for the catalog plus the filesystem, so the classification
 *  logic is tested without a real race. */
function context(
  catalog: Record<string, { id: string; contentHash: string }>,
  disk: Record<string, { id: string; contentHash: string }>,
): ReconcileContext {
  return {
    entryAtPath: (relativePath) => catalog[relativePath] ?? null,
    pathOfId: (id) => Object.entries(catalog).find(([, e]) => e.id === id)?.[0] ?? null,
    readFile: async (relativePath) => disk[relativePath] ?? null,
  }
}

describe('reconcilePaths', () => {
  it('reports a file the catalog has never seen as created', async () => {
    const changes = await reconcilePaths(
      ['New.md'],
      context({}, { 'New.md': { id: 'n1', contentHash: 'h1' } }),
    )
    expect(changes).toEqual([{ kind: 'created', pageId: 'n1', relativePath: 'New.md' }])
  })

  it('reports a changed hash as modified', async () => {
    const changes = await reconcilePaths(
      ['Note.md'],
      context(
        { 'Note.md': { id: 'n1', contentHash: 'old' } },
        { 'Note.md': { id: 'n1', contentHash: 'new' } },
      ),
    )
    expect(changes).toEqual([{ kind: 'modified', pageId: 'n1', relativePath: 'Note.md' }])
  })

  it('says nothing about a file whose content is unchanged', async () => {
    const changes = await reconcilePaths(
      ['Note.md'],
      context(
        { 'Note.md': { id: 'n1', contentHash: 'same' } },
        { 'Note.md': { id: 'n1', contentHash: 'same' } },
      ),
    )
    expect(changes).toEqual([])
  })

  it('reports a rename in Finder as one move, not a delete plus a create', async () => {
    // ★ The reason notes carry a UUID at all. Reported as delete + create,
    // the note would lose its backlinks, its annotations and its tree
    // position, and the user would see it vanish and a stranger appear.
    const changes = await reconcilePaths(
      ['Old.md', 'New.md'],
      context(
        { 'Old.md': { id: 'n1', contentHash: 'h1' } },
        { 'New.md': { id: 'n1', contentHash: 'h1' } },
      ),
    )
    expect(changes).toEqual([
      { kind: 'moved', pageId: 'n1', relativePath: 'New.md', previousPath: 'Old.md' },
    ])
  })

  it('recognises a move into another folder', async () => {
    const changes = await reconcilePaths(
      ['Note.md', 'Projects/Note.md'],
      context(
        { 'Note.md': { id: 'n1', contentHash: 'h1' } },
        { 'Projects/Note.md': { id: 'n1', contentHash: 'h1' } },
      ),
    )
    expect(changes[0]).toMatchObject({ kind: 'moved', previousPath: 'Note.md' })
  })

  it('does not care which order the two halves of a rename arrive in', async () => {
    const forwards = await reconcilePaths(
      ['Old.md', 'New.md'],
      context({ 'Old.md': { id: 'n1', contentHash: 'h' } }, { 'New.md': { id: 'n1', contentHash: 'h' } }),
    )
    const backwards = await reconcilePaths(
      ['New.md', 'Old.md'],
      context({ 'Old.md': { id: 'n1', contentHash: 'h' } }, { 'New.md': { id: 'n1', contentHash: 'h' } }),
    )
    expect(forwards).toEqual(backwards)
  })

  it('reports a genuine deletion', async () => {
    const changes = await reconcilePaths(
      ['Gone.md'],
      context({ 'Gone.md': { id: 'n1', contentHash: 'h' } }, {}),
    )
    expect(changes).toEqual([{ kind: 'deleted', pageId: 'n1', relativePath: 'Gone.md' }])
  })

  it('handles a move and an unrelated deletion in one batch', async () => {
    const changes = await reconcilePaths(
      ['Old.md', 'New.md', 'Gone.md'],
      context(
        {
          'Old.md': { id: 'n1', contentHash: 'h' },
          'Gone.md': { id: 'n2', contentHash: 'h' },
        },
        { 'New.md': { id: 'n1', contentHash: 'h' } },
      ),
    )
    expect(changes).toContainEqual({
      kind: 'moved', pageId: 'n1', relativePath: 'New.md', previousPath: 'Old.md',
    })
    expect(changes).toContainEqual({ kind: 'deleted', pageId: 'n2', relativePath: 'Gone.md' })
  })

  it('reports a vanished file it never knew about with a null id', async () => {
    const changes = await reconcilePaths(['Stranger.md'], context({}, {}))
    expect(changes).toEqual([{ kind: 'deleted', pageId: null, relativePath: 'Stranger.md' }])
  })

  it('deduplicates repeated events for one path', async () => {
    const changes = await reconcilePaths(
      ['Note.md', 'Note.md', 'Note.md'],
      context({}, { 'Note.md': { id: 'n1', contentHash: 'h' } }),
    )
    expect(changes).toHaveLength(1)
  })
})

describe('isWatchable', () => {
  it('watches notes and folders', () => {
    expect(isWatchable('Inbox/一个想法.md')).toBe(true)
    expect(isWatchable('Projects')).toBe(true)
    expect(isWatchable('Attachments/diagram.pdf')).toBe(true)
  })

  it('ignores app data and trash', () => {
    expect(isWatchable('.prism/ui.json')).toBe(false)
    expect(isWatchable('.prism/annotations/x.json')).toBe(false)
    expect(isWatchable('.trash/abc/Note.md')).toBe(false)
  })

  it('ignores other tools\' dot-directories', () => {
    expect(isWatchable('.git/objects/ab/cdef')).toBe(false)
    expect(isWatchable('.obsidian/workspace.json')).toBe(false)
  })

  it('ignores our own temp files, which would otherwise echo every save', () => {
    expect(isWatchable('.Note.md.abc123.prism-tmp')).toBe(false)
  })

  it('ignores file types the app cannot render', () => {
    expect(isWatchable('binary.exe')).toBe(false)
    expect(isWatchable('image.psd')).toBe(false)
  })

  it('handles Windows separators', () => {
    expect(isWatchable('.prism\\ui.json')).toBe(false)
    expect(isWatchable('Projects\\Note.md')).toBe(true)
  })
})

describe('classifyConflict', () => {
  it('is in sync when neither side moved', () => {
    expect(classifyConflict({ diskHash: 'a', knownHash: 'a', hasUnsavedEdits: false }))
      .toBe('in-sync')
  })

  it('refreshes silently when only the disk moved', () => {
    expect(classifyConflict({ diskHash: 'b', knownHash: 'a', hasUnsavedEdits: false }))
      .toBe('refresh')
  })

  it('waits for the pending save when only the editor moved', () => {
    expect(classifyConflict({ diskHash: 'a', knownHash: 'a', hasUnsavedEdits: true }))
      .toBe('local-pending')
  })

  it('asks when both moved', () => {
    // ★ The only case that must never resolve itself. Picking either side
    // silently loses whatever the other side said.
    expect(classifyConflict({ diskHash: 'b', knownHash: 'a', hasUnsavedEdits: true }))
      .toBe('conflict')
  })
})

describe('conflictCopyTitle', () => {
  it('stamps the copy so repeated conflicts accumulate instead of overwriting', () => {
    const first = conflictCopyTitle('Notes', new Date(2026, 7, 25, 14, 30, 5))
    const second = conflictCopyTitle('Notes', new Date(2026, 7, 25, 14, 30, 6))
    expect(first).toBe('Notes (conflicted copy 2026-08-25 143005)')
    expect(first).not.toBe(second)
  })
})

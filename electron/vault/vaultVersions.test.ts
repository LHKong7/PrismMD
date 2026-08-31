import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { versionsFor, type VaultVersions } from './vaultVersions'

let dir: string
let versions: VaultVersions

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-versions-'))
  versions = versionsFor(path.join(dir, 'versions'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function snapshot(over: Partial<Parameters<VaultVersions['save']>[0]> = {}) {
  return {
    id: 'v1',
    pageId: 'note-1',
    title: 'Kalman Filter',
    source: 'manual',
    label: null,
    createdAt: 1_700_000_000_000,
    content: '# Kalman\n\nThe original text.',
    ...over,
  }
}

describe('VaultVersions', () => {
  it('round-trips a snapshot', async () => {
    await versions.save(snapshot())
    const back = await versions.get('note-1', 'v1')
    expect(back).toMatchObject({
      id: 'v1',
      pageId: 'note-1',
      title: 'Kalman Filter',
      source: 'manual',
      createdAt: 1_700_000_000_000,
      content: '# Kalman\n\nThe original text.',
    })
  })

  it('stores the snapshot as readable Markdown', async () => {
    // ★ The point of a vault is that a person with a text editor can get
    // their work back. A JSON blob would technically round-trip and be
    // useless to the one person who most needs it.
    await versions.save(snapshot())
    const [file] = fs.readdirSync(path.join(dir, 'versions', 'note-1'))
    const raw = fs.readFileSync(path.join(dir, 'versions', 'note-1', file), 'utf-8')
    expect(raw).toContain('The original text.')
    expect(raw).toContain('prism-source: "manual"')
  })

  it('keeps a label with quotes in it intact', async () => {
    await versions.save(snapshot({ label: 'before the "big" rewrite' }))
    expect((await versions.get('note-1', 'v1'))!.label).toBe('before the "big" rewrite')
  })

  it('does not confuse two notes\' histories', async () => {
    await versions.save(snapshot())
    await versions.save(snapshot({ id: 'v2', pageId: 'note-2', content: 'other' }))
    expect(await versions.list('note-1')).toHaveLength(1)
    expect((await versions.get('note-2', 'v2'))!.content).toBe('other')
  })

  it('lists newest first, with lengths but without content', async () => {
    await versions.save(snapshot({ id: 'old', createdAt: 1000, content: 'aa' }))
    await versions.save(snapshot({ id: 'new', createdAt: 2000, content: 'bbbb' }))

    const list = await versions.list('note-1')
    expect(list.map((item) => item.id)).toEqual(['new', 'old'])
    expect(list[0].length).toBe(4)
    expect(list[0]).not.toHaveProperty('content')
  })

  it('keeps two snapshots taken in the same millisecond', async () => {
    // ★ The Archive takes one snapshot before a restore and one of the
    // restored text; a filename built from the timestamp alone would have
    // the second overwrite the first, losing the version being rolled back
    // from.
    await versions.save(snapshot({ id: 'a', createdAt: 5000 }))
    await versions.save(snapshot({ id: 'b', createdAt: 5000 }))
    expect(await versions.list('note-1')).toHaveLength(2)
  })

  it('removes one snapshot without touching the rest', async () => {
    await versions.save(snapshot({ id: 'a', createdAt: 1000 }))
    await versions.save(snapshot({ id: 'b', createdAt: 2000 }))
    await versions.remove('note-1', 'a')
    expect((await versions.list('note-1')).map((item) => item.id)).toEqual(['b'])
  })

  it('prunes the oldest past the cap', async () => {
    for (let i = 0; i < 5; i++) {
      await versions.save(snapshot({ id: `v${i}`, createdAt: 1000 + i }))
    }
    await versions.prune('note-1', 2)
    expect((await versions.list('note-1')).map((item) => item.id)).toEqual(['v4', 'v3'])
  })

  it('prunes only the note it was asked about', async () => {
    await versions.save(snapshot({ id: 'a', createdAt: 1 }))
    await versions.save(snapshot({ id: 'b', createdAt: 2 }))
    await versions.save(snapshot({ id: 'c', pageId: 'note-2', createdAt: 3 }))
    await versions.prune('note-1', 1)
    expect(await versions.list('note-2')).toHaveLength(1)
  })

  it('answers with nothing for a note that has no history', async () => {
    expect(await versions.list('never-touched')).toEqual([])
    expect(await versions.get('never-touched', 'v1')).toBeNull()
  })

  it('survives a damaged snapshot without losing the others', async () => {
    await versions.save(snapshot({ id: 'good', createdAt: 2000 }))
    fs.writeFileSync(path.join(dir, 'versions', 'note-1', '00000000001000-bad.md'), 'no front matter')
    expect((await versions.list('note-1')).map((item) => item.id)).toEqual(['good'])
  })

  it('reports which notes have a history, for a backup to check', async () => {
    await versions.save(snapshot())
    await versions.save(snapshot({ id: 'v2', pageId: 'note/2' }))
    expect((await versions.pageIds()).sort()).toEqual(['note-1', 'note/2'])
  })
})

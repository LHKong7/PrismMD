/**
 * These assertions are what stands between a user and a silent partial
 * migration. Each one is a way the migration could go wrong while still
 * looking like it worked.
 */
import { describe, expect, it } from 'vitest'
import {
  compareSnapshots,
  describeProblems,
  snapshotOf,
  type MigrationSnapshot,
} from './migrationValidator'
import type { Page } from '../repositories/noteRepository'

let counter = 0

function page(overrides: Partial<Page> & { title: string; content?: string }): Page {
  counter++
  return {
    id: overrides.id ?? `id-${counter}`,
    content: overrides.content ?? '',
    format: 'md',
    parentId: null,
    position: 0,
    createdAt: 1,
    updatedAt: 1,
    isDeleted: false,
    icon: null,
    isFolder: false,
    ...overrides,
  }
}

/** Folder chain carried on the page for the test's convenience. */
const chains = new Map<string, string[]>()

function snapshot(pages: Page[], sizes: Record<string, number> = {}): MigrationSnapshot {
  return snapshotOf({
    pages,
    folderChainOf: (p) => chains.get(p.id) ?? [],
    byteSizeOf: (p) => sizes[p.id] ?? 0,
  })
}

describe('snapshotOf', () => {
  it('fingerprints notes and ignores folders', () => {
    const note = page({ title: 'A', content: 'body' })
    const folder = page({ title: 'Folder', isFolder: true })
    const snap = snapshot([note, folder])

    expect(snap.notes).toHaveLength(1)
    expect(snap.notes[0]).toMatchObject({ id: note.id, title: 'A' })
  })

  it('derives every ancestor folder from a chain, not just the leaf', () => {
    const note = page({ title: 'Deep' })
    chains.set(note.id, ['Projects', 'Sub', 'Deeper'])
    expect(snapshot([note]).folderPaths).toEqual(['Projects', 'Projects/Sub', 'Projects/Sub/Deeper'])
  })

  it('counts distinct link targets and how many resolve', () => {
    const target = page({ title: 'Kalman Filter', content: 'theory' })
    const source = page({ title: 'Source', content: 'see [[Kalman Filter]] and [[Ghost]]' })
    const snap = snapshot([target, source])

    expect(snap.linkTargets).toEqual(['ghost', 'kalman filter'])
    expect(snap.resolvedLinks).toBe(1)
  })

  it('collects tags', () => {
    const note = page({ title: 'A', content: 'work #inbox #project/apos' })
    expect(snapshot([note]).tags).toEqual(['inbox', 'project/apos'])
  })

  it('is stable regardless of the order pages arrive in', () => {
    const a = page({ title: 'A', content: 'x' })
    const b = page({ title: 'B', content: 'y' })
    expect(snapshot([a, b])).toEqual(snapshot([b, a]))
  })
})

describe('compareSnapshots', () => {
  it('accepts an identical migration', () => {
    const notes = [page({ title: 'A', content: 'alpha' }), page({ title: 'B', content: 'bravo' })]
    const report = compareSnapshots(snapshot(notes), snapshot(notes))
    expect(report.ok).toBe(true)
    expect(report.problems).toEqual([])
    expect(report.counts.notesBefore).toBe(2)
  })

  it('catches a note that never arrived', () => {
    const a = page({ title: 'Kept', content: 'x' })
    const b = page({ title: 'Lost', content: 'y' })
    const report = compareSnapshots(snapshot([a, b]), snapshot([a]))

    expect(report.ok).toBe(false)
    expect(report.problems).toContainEqual(
      expect.objectContaining({ code: 'note.missing', subject: b.id }),
    )
  })

  it('catches content that changed in transit', () => {
    const before = page({ id: 'p1', title: 'A', content: 'original' })
    const after = page({ id: 'p1', title: 'A', content: 'mangled' })
    const report = compareSnapshots(snapshot([before]), snapshot([after]))

    expect(report.ok).toBe(false)
    expect(report.problems[0].code).toBe('note.content_changed')
  })

  it('catches a note that lost its title', () => {
    const before = page({ id: 'p1', title: 'Chapter 1: Setup', content: 'x' })
    // A migration that let the filename become the title would land here.
    const after = page({ id: 'p1', title: 'Chapter 1 Setup', content: 'x' })
    expect(compareSnapshots(snapshot([before]), snapshot([after])).problems[0].code)
      .toBe('note.title_changed')
  })

  it('catches a note that landed in the wrong folder', () => {
    const before = page({ id: 'p1', title: 'A', content: 'x' })
    const after = page({ id: 'p1', title: 'A', content: 'x' })
    chains.set('p1', ['Projects'])
    const beforeSnap = snapshot([before])
    chains.set('p1', [])
    const afterSnap = snapshot([after])

    expect(compareSnapshots(beforeSnap, afterSnap).problems.map((p) => p.code))
      .toContain('note.moved')
  })

  it('catches a folder that was never recreated', () => {
    const note = page({ id: 'p1', title: 'A', content: 'x' })
    chains.set('p1', ['Projects', 'Empty'])
    const before = snapshot([note])
    chains.set('p1', ['Projects', 'Empty'])
    const after = snapshot([note])
    // Simulate the deeper folder going missing.
    after.folderPaths = after.folderPaths.filter((f) => f !== 'Projects/Empty')

    expect(compareSnapshots(before, after).problems).toContainEqual(
      expect.objectContaining({ code: 'folder.missing', subject: 'Projects/Empty' }),
    )
  })

  it('catches a binary document whose bytes changed size', () => {
    const doc = page({ id: 'p1', title: 'Paper', format: 'pdf' })
    const before = snapshot([doc], { p1: 4096 })
    const after = snapshot([doc], { p1: 4095 })
    expect(compareSnapshots(before, after).problems[0].code).toBe('note.size_changed')
  })

  it('catches a link that stopped resolving', () => {
    // ★ The failure this exists for: a title changed during migration, so
    // every [[link]] into that note silently went dead.
    const target = page({ id: 't', title: 'Kalman Filter', content: 'x' })
    const source = page({ id: 's', title: 'S', content: 'see [[Kalman Filter]]' })
    const before = snapshot([target, source])
    const after = snapshot([page({ id: 't', title: 'Kalman  Filter!', content: 'x' }), source])

    const report = compareSnapshots(before, after)
    expect(report.problems.map((p) => p.code)).toContain('link.unresolved')
  })

  it('does not complain about a link that was already unresolved', () => {
    const source = page({ id: 's', title: 'S', content: 'see [[Never written]]' })
    const report = compareSnapshots(snapshot([source]), snapshot([source]))
    expect(report.ok).toBe(true)
  })

  it('catches a tag that disappeared', () => {
    const before = page({ id: 'p1', title: 'A', content: 'x #inbox' })
    const after = page({ id: 'p1', title: 'A', content: 'x' })
    const report = compareSnapshots(snapshot([before]), snapshot([after]))
    expect(report.problems.map((p) => p.code)).toEqual(
      expect.arrayContaining(['note.content_changed', 'tag.missing']),
    )
  })

  it('catches a note the vault has and the source does not', () => {
    const a = page({ title: 'Real', content: 'x' })
    const stray = page({ title: 'Stray', content: 'y' })
    expect(compareSnapshots(snapshot([a]), snapshot([a, stray])).problems[0].code)
      .toBe('note.unexpected')
  })

  it('matches by id, so a legal filename change is not a loss', () => {
    // ★ `a/b` cannot be a filename, so the file is `a b.md` — but the note is
    // the same note, and the title is preserved in front matter. Matching by
    // path would report every such note as missing and bury the real losses.
    const before = page({ id: 'p1', title: 'a/b', content: 'x' })
    const after = page({ id: 'p1', title: 'a/b', content: 'x' })
    expect(compareSnapshots(snapshot([before]), snapshot([after])).ok).toBe(true)
  })

  it('reports an empty workspace as a clean migration', () => {
    expect(compareSnapshots(snapshot([]), snapshot([])).ok).toBe(true)
  })
})

describe('describeProblems', () => {
  it('says so when there is nothing wrong', () => {
    expect(describeProblems(compareSnapshots(snapshot([]), snapshot([])))).toBe(
      'No differences found.',
    )
  })

  it('caps the list so a total failure does not produce an unreadable dialog', () => {
    const before = snapshot(Array.from({ length: 30 }, (_, i) => page({ title: `N${i}` })))
    const report = compareSnapshots(before, snapshot([]))
    const text = describeProblems(report, 3)

    expect(text.split('\n')).toHaveLength(4)
    expect(text).toContain('and 27 more')
  })
})

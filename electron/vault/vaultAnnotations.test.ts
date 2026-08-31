/**
 * Highlights are main data, and the sidecar is the only copy once a vault is
 * in use — so the assertions here are mostly about not losing them.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { annotationsFor, type StoredAnnotation } from './vaultAnnotations'

let dir: string

function highlight(overrides: Partial<StoredAnnotation> = {}): StoredAnnotation {
  return {
    id: 'a1',
    startOffset: 10,
    endOffset: 24,
    selectedText: 'a passage',
    color: 'yellow',
    createdAt: '2026-08-25T10:00:00.000Z',
    updatedAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-anno-')))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('VaultAnnotations', () => {
  it('round-trips highlights for a note', async () => {
    const store = annotationsFor(path.join(dir, 'annotations'))
    const items = [highlight(), highlight({ id: 'a2', startOffset: 40, note: 'a thought' })]

    await store.save('page-1', items)
    expect(await store.load('page-1')).toEqual(items)
  })

  it('distinguishes "never annotated" from "annotated, then cleared"', async () => {
    // ★ The difference drives the backfill: null means "look in the old
    // store", [] means "this note has been through here and has none".
    // Collapsing them would re-import deleted highlights forever.
    const store = annotationsFor(path.join(dir, 'annotations'))
    expect(await store.load('never-touched')).toBeNull()

    await store.save('page-1', [highlight()])
    await store.save('page-1', [])
    expect(await store.load('page-1')).toBeNull()
  })

  it('keeps one file per note, so two notes cannot clobber each other', async () => {
    const store = annotationsFor(path.join(dir, 'annotations'))
    await Promise.all([
      store.save('page-1', [highlight({ selectedText: 'first' })]),
      store.save('page-2', [highlight({ selectedText: 'second' })]),
    ])

    expect((await store.load('page-1'))![0].selectedText).toBe('first')
    expect((await store.load('page-2'))![0].selectedText).toBe('second')
    expect((await store.pageIds()).sort()).toEqual(['page-1', 'page-2'])
  })

  it('returns [] rather than null for a damaged file', async () => {
    // Unreadable is not the same as absent: answering null would send the
    // caller to the old store and let the next save overwrite the wreckage.
    const annotationDir = path.join(dir, 'annotations')
    fs.mkdirSync(annotationDir, { recursive: true })
    fs.writeFileSync(path.join(annotationDir, 'page-1.json'), '{ not json')

    expect(await annotationsFor(annotationDir).load('page-1')).toEqual([])
  })

  it('writes plain JSON a human can read and a diff can show', async () => {
    const store = annotationsFor(path.join(dir, 'annotations'))
    await store.save('page-1', [highlight()])
    const raw = fs.readFileSync(path.join(dir, 'annotations', 'page-1.json'), 'utf-8')

    expect(raw).toContain('"selectedText": "a passage"')
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('does not let a page id escape the annotations directory', async () => {
    const store = annotationsFor(path.join(dir, 'annotations'))
    await store.save('../../escaped', [highlight()])

    expect(fs.existsSync(path.join(dir, 'escaped.json'))).toBe(false)
    expect(await store.load('../../escaped')).toHaveLength(1)
  })
})

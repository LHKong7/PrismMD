/**
 * The format table exists twice — here for the main process and in
 * `src/lib/fileFormat.ts` for the renderer — because the two live in separate
 * TypeScript projects. Both files carry a "keep them in sync" comment, which
 * is exactly the kind of instruction that quietly stops being true. This test
 * enforces it instead.
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  ALL_SUPPORTED_EXTS,
  defaultExtFor,
  detectFormat,
  extOf,
  isSupported,
  kindOfFormat,
  mimeOfExt,
  openDialogFilters,
} from './fileFormats'

describe('format detection', () => {
  it.each([
    ['notes.md', 'md'],
    ['NOTES.MD', 'md'],
    ['a.markdown', 'md'],
    ['a.mdx', 'md'],
    ['log.txt', 'txt'],
    ['server.log', 'txt'],
    ['paper.pdf', 'pdf'],
    ['rows.csv', 'csv'],
    ['data.json', 'json'],
    ['book.xlsx', 'xlsx'],
    ['book.xls', 'xlsx'],
  ])('maps %s to %s', (name, format) => {
    expect(detectFormat(name)).toBe(format)
  })

  it.each(['binary', 'noext', 'archive.zip', '.bashrc'])('rejects %s', (name) => {
    expect(detectFormat(name)).toBeNull()
    expect(isSupported(name)).toBe(false)
  })

  it('detects through a full path, on either separator', () => {
    expect(detectFormat('/home/me/notes/a.pdf')).toBe('pdf')
    expect(detectFormat('C:\\Users\\me\\a.pdf')).toBe('pdf')
  })

  it('treats a leading dot as "no extension", not as one', () => {
    expect(extOf('.gitignore')).toBe('')
  })

  it('routes payloads to the right store', () => {
    expect(kindOfFormat('md')).toBe('text')
    expect(kindOfFormat('csv')).toBe('text')
    expect(kindOfFormat('pdf')).toBe('binary')
    expect(kindOfFormat('xlsx')).toBe('binary')
  })

  it('round-trips format → default extension → format', () => {
    for (const fmt of ['md', 'txt', 'pdf', 'csv', 'json', 'xlsx'] as const) {
      expect(detectFormat(`x${defaultExtFor(fmt)}`)).toBe(fmt)
    }
  })

  it('offers an "everything" row first in the open dialog', () => {
    const filters = openDialogFilters()
    expect(filters[0].name).toBe('Documents')
    expect(filters[0].extensions).toEqual([...ALL_SUPPORTED_EXTS])
  })

  it('knows a mime type for every supported extension', () => {
    for (const ext of ALL_SUPPORTED_EXTS) {
      expect(mimeOfExt(`.${ext}`)).not.toBe('application/octet-stream')
    }
  })
})

describe('parity with the renderer table', () => {
  it('supports exactly the same extensions on both sides', () => {
    const renderer = fs.readFileSync(
      path.resolve(__dirname, '../../src/lib/fileFormat.ts'),
      'utf8',
    )
    // Pull the extension literals out of the renderer's FORMATS table.
    const table = renderer.slice(renderer.indexOf('const FORMATS'), renderer.indexOf('] as const'))
    const rendererExts = [...table.matchAll(/'(\.[a-z0-9]+)'/g)].map((m) => m[1].slice(1))

    expect(rendererExts.sort()).toEqual([...ALL_SUPPORTED_EXTS].sort())
  })
})

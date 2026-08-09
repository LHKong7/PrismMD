/**
 * Reader mode's read-only guarantee lives or dies on this module, so its two
 * invariants get tests rather than trust: no write capability exists, and no
 * read escapes a mounted root.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as library from './libraryService'
import { listDir, mountFileParent, mountRoot, mountedRoots, readBytes, readText, statFile, unmountRoot } from './libraryService'

let ROOT: string
let OUTSIDE: string

beforeEach(() => {
  ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'libsvc-')))
  OUTSIDE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'outside-')))

  fs.writeFileSync(path.join(OUTSIDE, 'secret.md'), 'top secret')
  fs.mkdirSync(path.join(ROOT, 'sub'))
  fs.writeFileSync(path.join(ROOT, 'b.md'), '﻿# hello') // leading BOM
  fs.writeFileSync(path.join(ROOT, 'a10.md'), 'ten')
  fs.writeFileSync(path.join(ROOT, 'a9.md'), 'nine')
  fs.writeFileSync(path.join(ROOT, 'notes.txt'), 'txt')
  fs.writeFileSync(path.join(ROOT, 'sheet.xlsx'), Buffer.from([1, 2, 3, 4]))
  fs.writeFileSync(path.join(ROOT, 'ignore.exe'), 'nope')
  fs.writeFileSync(path.join(ROOT, '.hidden.md'), 'dot')
  fs.writeFileSync(path.join(ROOT, 'sub', 'deep.md'), 'deep')
  fs.symlinkSync(path.join(OUTSIDE, 'secret.md'), path.join(ROOT, 'escape.md'))
})

afterEach(() => {
  for (const r of mountedRoots()) unmountRoot(r)
  fs.rmSync(ROOT, { recursive: true, force: true })
  fs.rmSync(OUTSIDE, { recursive: true, force: true })
})

describe('mounting', () => {
  it('refuses every read until a root is mounted', () => {
    expect(() => readText(path.join(ROOT, 'b.md'))).toThrow(/outside every mounted folder/)
  })

  it('reports the mounted root', () => {
    mountRoot(ROOT)
    expect(mountedRoots()).toHaveLength(1)
  })

  it('rejects a file where a folder is expected', () => {
    expect(() => mountRoot(path.join(ROOT, 'b.md'))).toThrow(/Not a folder/)
  })

  it('mounts the containing folder of a file', () => {
    const root = mountFileParent(path.join(OUTSIDE, 'secret.md'))
    expect(root).toBe(OUTSIDE)
    expect(readText(path.join(OUTSIDE, 'secret.md'))).toBe('top secret')
  })

  it('revokes access when a root is unmounted', () => {
    mountRoot(OUTSIDE)
    expect(readText(path.join(OUTSIDE, 'secret.md'))).toBe('top secret')
    unmountRoot(OUTSIDE)
    expect(() => readText(path.join(OUTSIDE, 'secret.md'))).toThrow(/outside every mounted folder/)
  })
})

describe('listDir', () => {
  beforeEach(() => mountRoot(ROOT))

  it('puts directories before files', () => {
    expect(listDir(ROOT).entries[0].type).toBe('directory')
  })

  it('lists every supported file', () => {
    const names = listDir(ROOT).entries.map((e) => e.name)
    for (const n of ['a9.md', 'a10.md', 'b.md', 'notes.txt', 'sheet.xlsx']) {
      expect(names).toContain(n)
    }
  })

  it('skips unsupported extensions and dotfiles', () => {
    const names = listDir(ROOT).entries.map((e) => e.name)
    expect(names).not.toContain('ignore.exe')
    expect(names).not.toContain('.hidden.md')
  })

  it('drops symlinks that leave the root', () => {
    expect(listDir(ROOT).entries.map((e) => e.name)).not.toContain('escape.md')
  })

  it('sorts numerically, so a9 precedes a10', () => {
    const names = listDir(ROOT).entries.map((e) => e.name)
    expect(names.indexOf('a9.md')).toBeLessThan(names.indexOf('a10.md'))
  })

  it('tags each entry with its format, and directories with none', () => {
    const entries = listDir(ROOT).entries
    expect(entries.find((e) => e.name === 'sheet.xlsx')?.format).toBe('xlsx')
    expect(entries.find((e) => e.type === 'directory')?.format).toBeNull()
  })

  it('reads nested directories under the root', () => {
    expect(listDir(path.join(ROOT, 'sub')).entries[0].name).toBe('deep.md')
  })

  it('does not mark a small directory as truncated', () => {
    expect(listDir(ROOT).truncated).toBe(false)
  })
})

describe('reads', () => {
  beforeEach(() => mountRoot(ROOT))

  it('strips a leading BOM', () => {
    expect(readText(path.join(ROOT, 'b.md'))).toBe('# hello')
  })

  it('returns raw bytes for binary formats', () => {
    expect(readBytes(path.join(ROOT, 'sheet.xlsx'))).toHaveLength(4)
  })

  it('reports a file’s format', () => {
    expect(statFile(path.join(ROOT, 'notes.txt')).format).toBe('txt')
  })

  it('refuses to read a directory as text', () => {
    expect(() => readText(path.join(ROOT, 'sub'))).toThrow(/Not a file/)
  })
})

describe('the containment boundary', () => {
  beforeEach(() => mountRoot(ROOT))

  it.each([
    ['an absolute path outside the root', () => readText(path.join(OUTSIDE, 'secret.md'))],
    ['a ../ traversal', () => readText(path.join(ROOT, '..', path.basename(OUTSIDE), 'secret.md'))],
    ['a symlink pointing out of the root', () => readText(path.join(ROOT, 'escape.md'))],
    ['a system file', () => readText('/etc/passwd')],
    ['listing a directory outside the root', () => listDir(OUTSIDE)],
  ])('refuses %s', (_label, act) => {
    expect(act).toThrow(/outside every mounted folder/)
  })

  it.each([
    ['an empty path', ''],
    ['a non-string path', null as unknown as string],
  ])('refuses %s', (_label, bad) => {
    expect(() => readText(bad)).toThrow(/Invalid path/)
  })
})

describe('the read-only invariant', () => {
  it('exports no function that could write', () => {
    const writeish = Object.keys(library).filter((k) =>
      /write|save|delete|remove|rename|create|move|unlink|mkdir|copy/i.test(k),
    )
    expect(writeish).toEqual([])
  })

  it('leaves the folder it read untouched', () => {
    const before = fs.readdirSync(ROOT).sort()
    mountRoot(ROOT)
    listDir(ROOT)
    readText(path.join(ROOT, 'b.md'))
    readBytes(path.join(ROOT, 'sheet.xlsx'))
    expect(fs.readdirSync(ROOT).sort()).toEqual(before)
  })
})

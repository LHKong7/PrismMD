import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { atomicWriteFile, isTempFile, movePath, sweepTempFiles, TEMP_SUFFIX } from './atomicWrite'

let ROOT: string

beforeEach(() => {
  ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prism-atomic-')))
})

afterEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true })
})

describe('atomicWriteFile', () => {
  it('writes a new file', async () => {
    const target = path.join(ROOT, 'note.md')
    await atomicWriteFile(target, '# Hello\n')
    expect(fs.readFileSync(target, 'utf-8')).toBe('# Hello\n')
  })

  it('creates missing parent directories', async () => {
    const target = path.join(ROOT, 'a', 'b', 'note.md')
    await atomicWriteFile(target, 'body')
    expect(fs.readFileSync(target, 'utf-8')).toBe('body')
  })

  it('replaces an existing file', async () => {
    const target = path.join(ROOT, 'note.md')
    await atomicWriteFile(target, 'first')
    await atomicWriteFile(target, 'second')
    expect(fs.readFileSync(target, 'utf-8')).toBe('second')
  })

  it('leaves no temp file behind on success', async () => {
    await atomicWriteFile(path.join(ROOT, 'note.md'), 'body')
    expect(fs.readdirSync(ROOT).filter(isTempFile)).toEqual([])
  })

  it('leaves the previous content intact when the write fails', async () => {
    // ★ The property the whole module exists for: a failed write is a no-op,
    // never a truncated file. Writing to a path whose parent is a *file*
    // fails at the temp stage, which is exactly where a real failure lands.
    const target = path.join(ROOT, 'note.md')
    await atomicWriteFile(target, 'precious')

    const blocked = path.join(target, 'child.md')
    await expect(atomicWriteFile(blocked, 'nope')).rejects.toThrow()
    expect(fs.readFileSync(target, 'utf-8')).toBe('precious')
  })

  it('writes bytes as well as text', async () => {
    const target = path.join(ROOT, 'doc.pdf')
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    await atomicWriteFile(target, bytes)
    expect([...fs.readFileSync(target)]).toEqual([...bytes])
  })

  it('round-trips CJK content as UTF-8', async () => {
    const target = path.join(ROOT, 'note.md')
    await atomicWriteFile(target, '# 卡尔曼滤波\n\n正文\n')
    expect(fs.readFileSync(target, 'utf-8')).toBe('# 卡尔曼滤波\n\n正文\n')
  })

  it('survives concurrent writes to the same target', async () => {
    // Two writes racing on one temp name would interleave into a torn file;
    // the name carries a random component so they cannot collide.
    const target = path.join(ROOT, 'note.md')
    await Promise.all([
      atomicWriteFile(target, 'a'.repeat(5000)),
      atomicWriteFile(target, 'b'.repeat(5000)),
    ])
    const written = fs.readFileSync(target, 'utf-8')
    expect([`${'a'.repeat(5000)}`, `${'b'.repeat(5000)}`]).toContain(written)
  })
})

describe('movePath', () => {
  it('moves a file, creating the destination directory', async () => {
    const from = path.join(ROOT, 'note.md')
    const to = path.join(ROOT, 'sub', 'moved.md')
    fs.writeFileSync(from, 'body')

    await movePath(from, to)
    expect(fs.existsSync(from)).toBe(false)
    expect(fs.readFileSync(to, 'utf-8')).toBe('body')
  })
})

describe('sweepTempFiles', () => {
  it('removes leftovers from an interrupted write, recursively', async () => {
    fs.mkdirSync(path.join(ROOT, 'sub'))
    fs.writeFileSync(path.join(ROOT, `.note.md.abc${TEMP_SUFFIX}`), 'partial')
    fs.writeFileSync(path.join(ROOT, 'sub', `.other.md.def${TEMP_SUFFIX}`), 'partial')
    fs.writeFileSync(path.join(ROOT, 'keep.md'), 'real')

    expect(await sweepTempFiles(ROOT)).toBe(2)
    expect(fs.existsSync(path.join(ROOT, 'keep.md'))).toBe(true)
    expect(fs.readdirSync(ROOT).filter(isTempFile)).toEqual([])
  })

  it('is a no-op on a clean vault', async () => {
    fs.writeFileSync(path.join(ROOT, 'note.md'), 'body')
    expect(await sweepTempFiles(ROOT)).toBe(0)
  })
})

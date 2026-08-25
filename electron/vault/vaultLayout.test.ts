import { describe, expect, it } from 'vitest'
import * as path from 'path'
import {
  folderIdFor,
  folderPathFromId,
  isFolderId,
  isIgnoredDir,
  isInside,
  isSafeRelative,
  toAbsolute,
  toRelative,
  vaultPaths,
} from './vaultLayout'

const ROOT = path.resolve('/tmp/vault')

describe('vaultPaths', () => {
  it('puts app data under .prism and deletions under .trash', () => {
    const paths = vaultPaths(ROOT)
    expect(paths.prism).toBe(path.join(ROOT, '.prism'))
    expect(paths.trash).toBe(path.join(ROOT, '.trash'))
    expect(paths.uiFile).toBe(path.join(ROOT, '.prism', 'ui.json'))
    expect(paths.annotations).toBe(path.join(ROOT, '.prism', 'annotations'))
  })
})

describe('isIgnoredDir', () => {
  it('skips app, trash and tooling directories', () => {
    for (const name of ['.prism', '.trash', '.git', '.obsidian', 'node_modules']) {
      expect(isIgnoredDir(name)).toBe(true)
    }
  })

  it('skips any dot-directory, since none of them are notes', () => {
    expect(isIgnoredDir('.anything')).toBe(true)
  })

  it('does not skip ordinary folders', () => {
    for (const name of ['Inbox', 'Daily', 'Projects', '项目']) {
      expect(isIgnoredDir(name)).toBe(false)
    }
  })
})

describe('toRelative', () => {
  it('always uses forward slashes, whatever the platform', () => {
    // ★ This string is an identifier — stored in the catalog, matched against
    // watcher events, used as a folder id. A path recorded on Windows and
    // compared on macOS after a sync must still equal itself.
    const rel = toRelative(ROOT, path.join(ROOT, 'Projects', 'PrismMD.md'))
    expect(rel).toBe('Projects/PrismMD.md')
    expect(rel).not.toContain('\\')
  })

  it('round-trips through toAbsolute', () => {
    const absolute = path.join(ROOT, 'Daily', '2026-08-25.md')
    expect(toAbsolute(ROOT, toRelative(ROOT, absolute))).toBe(absolute)
  })
})

describe('isInside', () => {
  it('accepts a path within the vault', () => {
    expect(isInside(ROOT, path.join(ROOT, 'a', 'b.md'))).toBe(true)
    expect(isInside(ROOT, ROOT)).toBe(true)
  })

  it('rejects a sibling whose name merely starts the same', () => {
    // ★ A prefix check without the separator would accept /tmp/vaultX as
    // being inside /tmp/vault, which is a containment hole, not a typo.
    expect(isInside(ROOT, path.resolve('/tmp/vaultX/secret.md'))).toBe(false)
  })

  it('rejects a path that climbs out', () => {
    expect(isInside(ROOT, path.join(ROOT, '..', 'outside.md'))).toBe(false)
  })
})

describe('isSafeRelative', () => {
  it('accepts ordinary relative paths', () => {
    expect(isSafeRelative('Projects/PrismMD.md')).toBe(true)
    expect(isSafeRelative('note.md')).toBe(true)
  })

  it('rejects traversal, absolutes and empties', () => {
    expect(isSafeRelative('../escape.md')).toBe(false)
    expect(isSafeRelative('a/../../escape.md')).toBe(false)
    expect(isSafeRelative('a\\..\\..\\escape.md')).toBe(false)
    expect(isSafeRelative(path.resolve('/etc/passwd'))).toBe(false)
    expect(isSafeRelative('')).toBe(false)
  })

  it('rejects an embedded NUL', () => {
    // The syscall truncates at the NUL, so a string that looks contained in
    // JavaScript can address something else entirely on disk.
    expect(isSafeRelative('note\u0000/../../etc/passwd')).toBe(false)
  })
})

describe('folder ids', () => {
  it('derives a folder id from its path and back again', () => {
    expect(folderIdFor('Projects/Sub')).toBe('dir:Projects/Sub')
    expect(folderPathFromId('dir:Projects/Sub')).toBe('Projects/Sub')
    expect(isFolderId('dir:Projects')).toBe(true)
  })

  it('treats the vault root as no folder at all', () => {
    expect(folderIdFor('')).toBe('')
    expect(folderPathFromId(null)).toBeNull()
    expect(folderPathFromId('')).toBeNull()
  })

  it('does not mistake a note id for a folder id', () => {
    const uuid = '019a1234-5678-7000-a111-abcdef123456'
    expect(isFolderId(uuid)).toBe(false)
    expect(folderPathFromId(uuid)).toBeNull()
  })
})

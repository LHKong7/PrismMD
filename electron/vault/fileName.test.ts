import { describe, expect, it } from 'vitest'
import { sanitizeStem, titleFromFileName, uniqueFileName } from './fileName'

describe('sanitizeStem', () => {
  it('leaves an ordinary title alone', () => {
    expect(sanitizeStem('Kalman Filter')).toBe('Kalman Filter')
  })

  it('keeps CJK titles as they are', () => {
    expect(sanitizeStem('卡尔曼滤波')).toBe('卡尔曼滤波')
  })

  it('replaces every character Windows refuses', () => {
    const stem = sanitizeStem('a<b>c:d"e/f\\g|h?i*j')
    for (const bad of ['<', '>', ':', '"', '/', '\\', '|', '?', '*']) {
      expect(stem).not.toContain(bad)
    }
    expect(stem).toBe('a b c d e f g h i j')
  })

  it('strips control characters', () => {
    expect(sanitizeStem('a\u0001b\u001Fc')).toBe('a b c')
  })

  it('strips invisible characters that make two names look identical', () => {
    expect(sanitizeStem('Note\u200B')).toBe('Note')
    expect(sanitizeStem('No\u200Bte')).toBe(sanitizeStem('Note'))
  })

  it('drops trailing dots and spaces, which Windows silently removes anyway', () => {
    // ★ If we recorded `Notes...` while Windows wrote `Notes`, every later
    // lookup by that name would miss a file that is sitting right there.
    expect(sanitizeStem('Notes...')).toBe('Notes')
    expect(sanitizeStem('Notes   ')).toBe('Notes')
  })

  it('drops a leading dot so the note is not hidden', () => {
    expect(sanitizeStem('.hidden')).toBe('hidden')
  })

  it('escapes the Windows device names', () => {
    for (const reserved of ['CON', 'nul', 'COM1', 'lpt9']) {
      expect(sanitizeStem(reserved).toLowerCase()).not.toBe(reserved.toLowerCase())
    }
    expect(sanitizeStem('CON')).toBe('CON_')
    // Only the exact stem is reserved; a longer name containing it is fine.
    expect(sanitizeStem('Console')).toBe('Console')
  })

  it('falls back rather than producing an empty or dotfile name', () => {
    expect(sanitizeStem('')).toBe('Untitled')
    expect(sanitizeStem('///')).toBe('Untitled')
    expect(sanitizeStem('...')).toBe('Untitled')
  })

  it('truncates by bytes, not characters, and never mid-character', () => {
    // 400 CJK characters is ~1200 bytes — well past every filesystem's limit.
    const stem = sanitizeStem('测'.repeat(400))
    expect(Buffer.byteLength(stem, 'utf8')).toBeLessThanOrEqual(180)
    // A cut through a multi-byte character would leave a replacement char.
    expect(stem).not.toContain('�')
    expect(stem).toBe('测'.repeat(60))
  })
})

describe('uniqueFileName', () => {
  it('uses the plain name when nothing has taken it', () => {
    expect(uniqueFileName('Notes', '.md', [])).toBe('Notes.md')
  })

  it('numbers collisions the way the OS does', () => {
    expect(uniqueFileName('Untitled', '.md', ['Untitled.md'])).toBe('Untitled 2.md')
    expect(uniqueFileName('Untitled', '.md', ['Untitled.md', 'Untitled 2.md']))
      .toBe('Untitled 3.md')
  })

  it('treats names as case-insensitive, because APFS and NTFS do', () => {
    // ★ Returning `Notes.md` as free when `notes.md` exists would overwrite
    // someone's note on macOS and Windows, and not on Linux — the worst kind
    // of bug to reproduce.
    expect(uniqueFileName('Notes', '.md', ['notes.md'])).toBe('Notes 2.md')
  })

  it('keeps two titles that sanitize alike as two files', () => {
    const first = uniqueFileName('a/b', '.md', [])
    const second = uniqueFileName('a:b', '.md', [first])
    expect(first).toBe('a b.md')
    expect(second).toBe('a b 2.md')
    expect(second).not.toBe(first)
  })

  it('honours the extension it is given', () => {
    expect(uniqueFileName('Sheet', '.xlsx', [])).toBe('Sheet.xlsx')
  })
})

describe('titleFromFileName', () => {
  it('drops the extension', () => {
    expect(titleFromFileName('Kalman Filter.md')).toBe('Kalman Filter')
  })

  it('keeps dots inside the name', () => {
    expect(titleFromFileName('v1.2 release notes.md')).toBe('v1.2 release notes')
  })

  it('leaves an extensionless name alone', () => {
    expect(titleFromFileName('LICENSE')).toBe('LICENSE')
  })
})

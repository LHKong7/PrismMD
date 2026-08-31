/**
 * Turning a note title into a filename that survives every platform the vault
 * might be opened, synced or backed up on.
 *
 * ★ The rule this file exists to enforce: **a filename may never be lost or
 * silently merged**. A title the filesystem rejects has to become a filename
 * that works, and two notes whose titles sanitize to the same string must end
 * up as two files — because "the second note quietly replaced the first" is
 * the failure a vault must never have.
 *
 * The constraints are the union of everything, not just the host platform: a
 * vault written on macOS gets opened on Windows via Dropbox, and a name that
 * is legal here and illegal there produces a sync error the user cannot fix
 * from inside PrismMD.
 */

/** Illegal on Windows, plus the separators every platform reserves. */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001F]/g

/**
 * Windows refuses these as a *stem*, with or without an extension, even in a
 * subdirectory. `NUL.md` cannot be created at all.
 */
const RESERVED_STEMS = new Set([
  'con', 'prn', 'aux', 'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
])

/**
 * 255 is the per-component limit on ext4, APFS and NTFS alike. Budget is in
 * *bytes*, not characters: a CJK title is three bytes per character in UTF-8,
 * so 255 characters would be nearly 800 bytes and would fail to write.
 */
const MAX_STEM_BYTES = 180

/**
 * A title with nothing usable in it — all punctuation, all emoji-with-
 * modifiers, or empty. Better a boring name than a file called `.md`.
 */
const FALLBACK = 'Untitled'

export function sanitizeStem(title: string): string {
  let stem = title
    .replace(ILLEGAL, ' ')
    // Direction marks and zero-width characters are invisible in a file
    // listing; two names differing only by one look identical and are not.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Windows silently strips trailing dots and spaces, so `Notes...` is written
  // as `Notes` — and the name we recorded no longer matches the file on disk.
  stem = stem.replace(/[. ]+$/, '')
  // A leading dot makes the note hidden on Unix and invisible in the tree.
  stem = stem.replace(/^\.+/, '')

  // Truncating can re-expose a trailing dot or space, so trim again after.
  stem = truncateToBytes(stem, MAX_STEM_BYTES).replace(/[. ]+$/, '')

  if (!stem) return FALLBACK
  if (RESERVED_STEMS.has(stem.toLowerCase())) return `${stem}_`
  return stem
}

/** Cut to a byte budget without splitting a multi-byte character in half. */
function truncateToBytes(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let out = ''
  let bytes = 0
  for (const char of text) {
    const size = Buffer.byteLength(char, 'utf8')
    if (bytes + size > maxBytes) break
    out += char
    bytes += size
  }
  return out.trim()
}

/**
 * A filename that does not collide with anything `taken` already holds.
 *
 * Comparison is case-insensitive because APFS and NTFS are: `Notes.md` and
 * `notes.md` are one file there, and returning the second as "available"
 * would overwrite the first.
 */
export function uniqueFileName(
  title: string,
  extension: string,
  taken: Iterable<string>,
): string {
  const stem = sanitizeStem(title)
  const lowered = new Set<string>()
  for (const name of taken) lowered.add(name.toLowerCase())

  const candidate = `${stem}${extension}`
  if (!lowered.has(candidate.toLowerCase())) return candidate

  // `Untitled.md`, `Untitled 2.md`, `Untitled 3.md` — the convention Finder
  // and Obsidian both use, so the numbering looks like the OS's own.
  for (let n = 2; n < 10_000; n++) {
    const next = `${stem} ${n}${extension}`
    if (!lowered.has(next.toLowerCase())) return next
  }
  // Ten thousand notes with one title is not a real workspace, but returning
  // a colliding name would be data loss, so fall back to something unique.
  return `${stem} ${Date.now()}${extension}`
}

/** The display title a file carries when its front matter names none. */
export function titleFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  return withoutExt || fileName
}

/**
 * YAML front matter, read narrowly and written surgically.
 *
 * ★ This does **not** parse YAML into an object and serialize it back. That
 * round trip is lossy in ways that matter here: it drops comments, reorders
 * keys, rewrites quoting, and collapses anything the model does not know
 * about. A vault is meant to be shared with Obsidian, Logseq, git and a plain
 * text editor, so a note that came in with `aliases`, `cssclass` and a comment
 * has to come out with all three untouched — even though PrismMD understands
 * none of them.
 *
 * So: reading understands a deliberately small subset (the fields below);
 * writing edits *the lines of the keys it owns* and leaves every other byte
 * exactly where it was. Anything this file cannot parse, it preserves.
 *
 * PrismMD writes `id`, `title`, `created`, `updated`, and the three editorial
 * fields `status`, `genre` and `quality`. It reads `tags` but never writes
 * them — that list is the author's, and rewriting it would mean having an
 * opinion about a field the user maintains by hand.
 *
 * ★ The editorial three are here rather than in a sidecar because they are
 * things the user decided about a note, and the vault's rule is that user
 * intent does not live only in SQLite. They are also exactly the fields other
 * Markdown tools already expect in front matter, so `status: draft` set in
 * Obsidian shows up on the shelf here, and vice versa. The cost is that
 * flagging a note dirties its file — acceptable for a per-note judgement
 * saved on an explicit click, and not acceptable for sidebar drag order,
 * which is why that stayed in `ui.json`.
 */

export interface NoteFrontmatter {
  /** Stable identity. Survives renames, moves, and edits in other tools. */
  id?: string
  /** Display title, overriding the filename when present. */
  title?: string
  tags?: string[]
  created?: string
  updated?: string
  /** Editorial state: draft / done / revise / hot. */
  status?: string
  /** Editorial category: tech / biz / essay / note. */
  genre?: string
  /** Star rating, written unquoted so other tools read it as a number. */
  quality?: string
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter
  /** The front matter block's inner lines, or null when there is none. */
  rawFrontmatter: string | null
  /** Everything after the front matter block. */
  body: string
}

const FENCE = '---'

/** A top-level key line: no indent, `key:` possibly followed by a value. */
const KEY_LINE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/

/**
 * Locate the front matter block.
 *
 * Only a block starting on the very first line counts. A `---` further down is
 * a horizontal rule, and treating it as front matter would eat the note.
 */
function findBlock(source: string): { inner: string; bodyStart: number } | null {
  if (!source.startsWith(`${FENCE}\n`) && !source.startsWith(`${FENCE}\r\n`)) return null

  const lines = source.split('\n')
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() !== FENCE) continue
    const inner = lines.slice(1, i).join('\n')
    // +1 for the closing fence line itself; the body starts on the next line.
    const consumed = lines.slice(0, i + 1).join('\n').length
    const bodyStart = consumed < source.length ? consumed + 1 : source.length
    return { inner, bodyStart }
  }
  // An unterminated block: the whole file is front matter as far as YAML is
  // concerned, but treating it that way would hide the user's text. Better to
  // decide there is no front matter and leave the note readable.
  return null
}

export function parseNote(source: string): ParsedNote {
  const block = findBlock(source)
  if (!block) return { frontmatter: {}, rawFrontmatter: null, body: source }
  return {
    frontmatter: parseFields(block.inner),
    rawFrontmatter: block.inner,
    body: source.slice(block.bodyStart),
  }
}

function parseFields(inner: string): NoteFrontmatter {
  const out: NoteFrontmatter = {}
  const lines = inner.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i])
    if (!match) continue
    const [, key, rest] = match

    if (key === 'tags') {
      out.tags = parseTags(rest, lines, i)
      continue
    }
    if ((WRITABLE as string[]).includes(key)) {
      const value = parseScalar(rest)
      if (value) out[key as WritableKey] = value
    }
  }
  return out
}

/** `tags: [a, b]`, or a block sequence of `- a` lines beneath `tags:`. */
function parseTags(rest: string, lines: string[], keyIndex: number): string[] {
  const inline = rest.trim()
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((item) => parseScalar(item))
      .filter(Boolean)
  }
  if (inline) return [parseScalar(inline)].filter(Boolean)

  const tags: string[] = []
  for (let i = keyIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    // A new top-level key ends the sequence.
    if (!/^[ \t]/.test(line)) break
    const item = /^[ \t]*-[ \t]*(.*)$/.exec(line)
    if (!item) break
    const value = parseScalar(item[1])
    if (value) tags.push(value)
  }
  return tags
}

/** Unwrap a quoted scalar, or trim a bare one. Comments are not stripped from
 *  bare values: a `#` inside a title is far more likely than a YAML comment. */
function parseScalar(raw: string): string {
  const text = raw.trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  return text
}

/**
 * Always double-quoted.
 *
 * A bare scalar would be shorter, but titles contain `:`, `#`, `[`, leading
 * digits and the words `true`/`no`/`null` — each of which changes meaning or
 * breaks parsing unquoted. Quoting unconditionally is one rule instead of a
 * list of exceptions to keep in sync with the YAML spec.
 */
function writeScalar(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** The keys this module is allowed to rewrite. */
type WritableKey = 'id' | 'title' | 'created' | 'updated' | 'status' | 'genre' | 'quality'
const WRITABLE: WritableKey[] = ['id', 'title', 'created', 'updated', 'status', 'genre', 'quality']

/**
 * Keys written bare when they look like a number.
 *
 * A quoted `quality: "4"` is valid YAML and PrismMD reads it back fine, but
 * every other tool then sorts and filters it as text — where 10 comes before
 * 2. Titles get quoted unconditionally because their content is arbitrary;
 * this one is a rating, and a rating that is not a number is worth writing as
 * a string rather than corrupting the file.
 */
const NUMERIC: ReadonlySet<string> = new Set(['quality'])

function writeValue(key: string, value: string): string {
  return NUMERIC.has(key) && /^-?\d+(\.\d+)?$/.test(value) ? value : writeScalar(value)
}

/**
 * Write the given fields into `source`, leaving everything else byte-identical.
 *
 * Passing `undefined` for a field leaves any existing line alone; passing
 * `null` removes the key.
 */
export function setFrontmatter(
  source: string,
  fields: Partial<Record<WritableKey, string | null>>,
): string {
  const block = findBlock(source)
  const body = block ? source.slice(block.bodyStart) : source
  const lines = block ? block.inner.split('\n') : []

  for (const key of WRITABLE) {
    const value = fields[key]
    if (value === undefined) continue

    const at = indexOfKey(lines, key)
    if (at < 0) {
      if (value !== null) lines.push(`${key}: ${writeValue(key, value)}`)
      continue
    }

    // Replace the key line and drop any continuation lines belonging to it,
    // so switching a block sequence to a scalar does not strand its items.
    const end = endOfEntry(lines, at)
    const replacement = value === null ? [] : [`${key}: ${writeValue(key, value)}`]
    lines.splice(at, end - at, ...replacement)
  }

  const inner = lines.filter((line, i) => !(line === '' && i === lines.length - 1)).join('\n')
  if (!inner.trim()) {
    // Nothing left worth keeping — do not leave an empty `---\n---` header.
    return body
  }
  return `${FENCE}\n${inner}\n${FENCE}\n${body.startsWith('\n') ? body.slice(1) : body}`
}

function indexOfKey(lines: string[], key: string): number {
  return lines.findIndex((line) => {
    const match = KEY_LINE.exec(line)
    return match?.[1] === key
  })
}

/** One past the last line belonging to the entry that starts at `start`. */
function endOfEntry(lines: string[], start: number): number {
  let end = start + 1
  while (end < lines.length && /^[ \t]/.test(lines[end]) && lines[end].trim()) end++
  return end
}

/** Rebuild a note from its parts. Used when creating a note from scratch. */
export function composeNote(frontmatter: NoteFrontmatter, body: string): string {
  const lines: string[] = []
  for (const key of WRITABLE) {
    const value = frontmatter[key]
    if (value) lines.push(`${key}: ${writeValue(key, value)}`)
  }
  if (frontmatter.tags?.length) {
    lines.push('tags:')
    for (const tag of frontmatter.tags) lines.push(`  - ${writeScalar(tag)}`)
  }
  if (lines.length === 0) return body
  return `${FENCE}\n${lines.join('\n')}\n${FENCE}\n${body}`
}

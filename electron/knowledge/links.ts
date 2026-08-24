/**
 * Wiki-link and tag extraction.
 *
 * ★ Links are what separate a knowledge base from a folder of markdown.
 * A folder answers "where did I put it"; a link graph answers "what does
 * this connect to" — backlinks, related notes, and the orphans nothing
 * points at. PrismMD stores notes in SQLite with UUID ids, so the link
 * syntax deliberately targets a *title*, not an id: you write `[[Kalman
 * Filter]]` before that note exists, and it resolves the moment you create
 * it. That also means resolution is a query-time join, never a stored
 * foreign key — see `engine.ts`.
 */

export interface WikiLink {
  /** The raw target as typed, e.g. `Kalman Filter`. */
  target: string
  /** Normalized target used for matching. */
  normalized: string
  /** Optional `#heading` fragment. */
  heading: string | null
  /** Optional `|display text`. */
  alias: string | null
  /** Offsets of the whole `[[...]]` span in the source. */
  start: number
  end: number
}

export interface NoteTag {
  tag: string
  start: number
  end: number
}

/**
 * `[[target]]`, `[[target|alias]]`, `[[target#heading]]`, `[[target#heading|alias]]`.
 * The target stops at `#`, `|` or `]`, so none of those can appear in a title —
 * an acceptable trade for a syntax people already know from Obsidian/Roam.
 */
const WIKILINK_RE = /\[\[([^\]#|\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g

/**
 * `#tag`, `#nested/tag`, `#中文标签`. Must be preceded by start-of-string,
 * whitespace or an opening bracket, so `C#` and `issue#12` are not tags. The
 * character right after `#` must be a tag character, which is also what keeps
 * markdown headings (`# Title`, space required) out of the results.
 */
const TAG_RE = /(^|[\s(\uFF08\u3010])#([A-Za-z0-9\u00C0-\u024F\u3400-\u9FFF\uAC00-\uD7AF_][A-Za-z0-9\u00C0-\u024F\u3400-\u9FFF\uAC00-\uD7AF_\-/]*)/g

/**
 * Normalize a page title for link matching: case-folded, whitespace collapsed.
 *
 * Deliberately *not* punctuation-stripped — "Chapter 1: Setup" and
 * "Chapter 1 Setup" are plausibly different notes, and silently merging two
 * notes is worse than failing to link one.
 */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Blank out fenced code, inline code and inline math *in place*, replacing
 * each masked character with a space.
 *
 * ★ Masking rather than deleting keeps every offset in the returned string
 * equal to its offset in the source, so a link's `start`/`end` still point at
 * the real text. A `[[foo]]` inside a code fence is an example, not a link.
 */
export function maskCode(content: string): string {
  const chars = [...content]
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < chars.length; i++) {
      if (chars[i] !== '\n') chars[i] = ' '
    }
  }

  // Fenced blocks first — an inline-code scan inside a fence is meaningless.
  const fenceRe = /^([ \t]{0,3})(`{3,}|~{3,})[^\n]*$/gm
  let openIdx: number | null = null
  let openMarker = ''
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(content)) !== null) {
    const marker = m[2][0]
    if (openIdx === null) {
      openIdx = m.index
      openMarker = marker
    } else if (marker === openMarker) {
      blank(openIdx, m.index + m[0].length)
      openIdx = null
    }
  }
  if (openIdx !== null) blank(openIdx, content.length)

  const masked = chars.join('')

  // Inline code and `$…$` math, over the fence-masked text so we never
  // re-open a span that lived inside a fence.
  const out = [...masked]
  for (const re of [/`+[^`\n]*`+/g, /\$[^$\n]+\$/g]) {
    let inline: RegExpExecArray | null
    while ((inline = re.exec(masked)) !== null) {
      for (let i = inline.index; i < inline.index + inline[0].length; i++) {
        if (out[i] !== '\n') out[i] = ' '
      }
    }
  }
  return out.join('')
}

export function extractWikiLinks(content: string): WikiLink[] {
  const masked = maskCode(content)
  const out: WikiLink[] = []
  let m: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((m = WIKILINK_RE.exec(masked)) !== null) {
    const target = m[1].trim()
    if (!target) continue
    out.push({
      target,
      normalized: normalizeTitle(target),
      heading: m[2]?.trim() || null,
      alias: m[3]?.trim() || null,
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  return out
}

export function extractTags(content: string): NoteTag[] {
  const masked = maskCode(content)
  const out: NoteTag[] = []
  let m: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(masked)) !== null) {
    // `#` is only a heading when a space follows it, which TAG_RE forbids,
    // so a `#tag` at the start of a line is unambiguously a tag.
    const at = m.index + m[1].length
    out.push({ tag: m[2].toLowerCase(), start: at, end: at + m[2].length + 1 })
  }
  return out
}

/**
 * Collapse a note's links into one row per distinct target, counting
 * occurrences. Ten mentions of the same note is one edge with weight ten,
 * not ten edges — the graph queries all want the former.
 */
export function collapseLinks(links: WikiLink[]): {
  normalized: string
  target: string
  heading: string | null
  alias: string | null
  occurrences: number
}[] {
  const byTarget = new Map<string, { normalized: string; target: string; heading: string | null; alias: string | null; occurrences: number }>()
  for (const link of links) {
    const existing = byTarget.get(link.normalized)
    if (existing) {
      existing.occurrences += 1
      existing.heading ??= link.heading
      existing.alias ??= link.alias
      continue
    }
    byTarget.set(link.normalized, {
      normalized: link.normalized,
      target: link.target,
      heading: link.heading,
      alias: link.alias,
      occurrences: 1,
    })
  }
  return [...byTarget.values()]
}

/**
 * Rewrite every `[[old title]]` in `content` to `[[new title]]`.
 *
 * ★ Renaming a note breaks every link into it, and a knowledge base that
 * rots when you rename things stops being one. Matching is on the normalized
 * form so `[[kalman filter]]` follows a rename of "Kalman Filter"; aliases
 * and heading fragments are preserved verbatim because those are the
 * author's words, not the title's.
 */
export function rewriteWikiLinks(content: string, fromTitle: string, toTitle: string): string {
  const from = normalizeTitle(fromTitle)
  if (!from || from === normalizeTitle(toTitle)) return content

  const links = extractWikiLinks(content).filter((l) => l.normalized === from)
  if (links.length === 0) return content

  let out = ''
  let cursor = 0
  for (const link of links) {
    const suffix = `${link.heading ? `#${link.heading}` : ''}${link.alias ? `|${link.alias}` : ''}`
    out += content.slice(cursor, link.start) + `[[${toTitle}${suffix}]]`
    cursor = link.end
  }
  return out + content.slice(cursor)
}

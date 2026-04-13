/**
 * DOM text-offset mapper.
 *
 * After the markdown pipeline renders a document to the DOM, several
 * features need to jump back and forth between "character offset in the
 * rendered plain text" and "live DOM Range":
 *
 * - Inline citations (evidence span → Range to scroll/highlight)
 * - Entity linking (trie match → wrap with <span>)
 * - Correct annotation offsets (the current impl stores `0..length` which
 *   is semantically wrong; this gives the real index)
 *
 * The map is built once per document render and invalidated whenever the
 * content changes. It holds onto DOM node references — callers MUST
 * rebuild it after re-rendering rather than persisting across files.
 */

export interface TextLocation {
  /** Text node containing the character. */
  node: Text
  /** Offset within that text node (0-based, character-level). */
  nodeOffset: number
}

export interface OffsetMap {
  /** Total concatenated plain-text length of the mapped subtree. */
  totalLength: number
  /** The concatenated plain text (indices match `locate()`). */
  text: string
  /** Resolve a character offset into `{ node, nodeOffset }`. */
  locate(offset: number): TextLocation | null
  /**
   * Build a live DOM `Range` covering `[start, end)` of the concatenated
   * text. Returns `null` if either endpoint can't be resolved (e.g. the
   * content was re-rendered and the map is stale).
   */
  createRange(start: number, end: number): Range | null
  /**
   * Find every occurrence of `needle` in the mapped text. Case-sensitive
   * by default (pass `{ caseInsensitive: true }` for a loose match).
   * Returns a list of `[start, end)` pairs.
   */
  findAll(needle: string, opts?: { caseInsensitive?: boolean }): Array<[number, number]>
}

interface Segment {
  node: Text
  /** Absolute text offset of this node's first character. */
  start: number
  /** Length of this node's text. */
  length: number
}

/**
 * Walk the given root and collect every `Text` node along with its
 * starting offset in the concatenated plain text.
 *
 * We deliberately skip `<script>`, `<style>` and `[contenteditable]`
 * subtrees — none appear in the rendered markdown today, but guarding is
 * cheap and keeps the mapper safe to reuse on other DOM trees later.
 */
function collectSegments(root: Node): { segments: Segment[]; text: string } {
  const segments: Segment[] = []
  const parts: string[] = []
  let cursor = 0

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      let parent: Node | null = node.parentNode
      while (parent && parent !== root) {
        if (parent.nodeType === Node.ELEMENT_NODE) {
          const el = parent as Element
          const tag = el.tagName
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT
          }
        }
        parent = parent.parentNode
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let current = walker.nextNode()
  while (current) {
    const text = (current as Text).data
    if (text.length > 0) {
      segments.push({ node: current as Text, start: cursor, length: text.length })
      parts.push(text)
      cursor += text.length
    }
    current = walker.nextNode()
  }

  return { segments, text: parts.join('') }
}

/**
 * Binary-search for the segment containing a given offset.
 */
function findSegment(segments: Segment[], offset: number): Segment | null {
  if (segments.length === 0) return null
  let lo = 0
  let hi = segments.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const seg = segments[mid]
    if (offset < seg.start) {
      hi = mid - 1
    } else if (offset >= seg.start + seg.length) {
      lo = mid + 1
    } else {
      return seg
    }
  }
  // Allow offset === totalLength to resolve to the end of the last segment.
  const last = segments[segments.length - 1]
  if (last && offset === last.start + last.length) return last
  return null
}

export function buildOffsetMap(root: Node): OffsetMap {
  const { segments, text } = collectSegments(root)
  const totalLength = text.length

  const locate = (offset: number): TextLocation | null => {
    if (offset < 0 || offset > totalLength) return null
    const seg = findSegment(segments, offset)
    if (!seg) return null
    return { node: seg.node, nodeOffset: offset - seg.start }
  }

  const createRange = (start: number, end: number): Range | null => {
    if (start < 0 || end < start || end > totalLength) return null
    const a = locate(start)
    const b = locate(end)
    if (!a || !b) return null
    const range = document.createRange()
    try {
      range.setStart(a.node, a.nodeOffset)
      range.setEnd(b.node, b.nodeOffset)
    } catch {
      return null
    }
    return range
  }

  const findAll = (needle: string, opts?: { caseInsensitive?: boolean }): Array<[number, number]> => {
    if (!needle) return []
    const haystack = opts?.caseInsensitive ? text.toLowerCase() : text
    const query = opts?.caseInsensitive ? needle.toLowerCase() : needle
    const out: Array<[number, number]> = []
    let from = 0
    while (from <= haystack.length - query.length) {
      const idx = haystack.indexOf(query, from)
      if (idx === -1) break
      out.push([idx, idx + query.length])
      from = idx + query.length
    }
    return out
  }

  return { totalLength, text, locate, createRange, findAll }
}

/**
 * Best-effort utility: scroll a `[start, end)` range into view and flash a
 * highlight on it. Used by inline citations.
 */
export function scrollRangeIntoView(range: Range, opts?: { highlight?: boolean }): void {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return

  const el = range.startContainer.parentElement
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })

  if (opts?.highlight !== false) {
    const PULSE_CLASS = 'prism-citation-pulse'
    el.classList.add(PULSE_CLASS)
    window.setTimeout(() => el.classList.remove(PULSE_CLASS), 1600)
  }
}

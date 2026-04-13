import { create } from 'zustand'
import { buildOffsetMap, scrollRangeIntoView } from '../lib/markdown/offsetMap'

/**
 * Singleton bridge between the reader DOM and features that want to
 * scroll to / highlight a passage without being children of the reader.
 *
 * The markdown-body element is registered by `MarkdownReader` on mount
 * and cleared on unmount. Consumers (the chat citation superscripts, a
 * future "search in document" feature, etc.) call `scrollToEvidence`
 * with a quote and the store resolves it to a DOM Range and scrolls
 * there with a brief pulse.
 *
 * Why here instead of a React context? The consumer (ChatMessage) lives
 * in the agent sidebar, which is rendered as a sibling of the reader.
 * A zustand store is friendlier to reach for from either tree without
 * restructuring.
 */

interface ReaderDomStore {
  markdownBody: HTMLElement | null
  setMarkdownBody: (el: HTMLElement | null) => void
  /**
   * Attempt to locate `quote` inside the current markdown render and
   * scroll it into view with a pulse. Returns `true` if a match was
   * found. Tries progressively looser matches (exact → first-sentence →
   * longest distinctive word) before giving up — evidence text from the
   * RAG pipeline rarely appears verbatim in the source.
   */
  scrollToEvidence: (quote: string) => boolean
}

/**
 * Extract the first "sentence-ish" slice of a quote. Stops at the first
 * sentence-ending punctuation and caps at ~120 chars so we don't end up
 * searching for a whole paragraph.
 */
function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]{10,180}[.!?]/)
  if (match) return match[0].trim()
  return text.slice(0, Math.min(120, text.length)).trim()
}

/**
 * Find the longest "distinctive" word in the quote: length ≥ 6, all
 * letters (skips stopwords via a stopword set). Empty string if no word
 * qualifies. Used as the last-ditch match strategy.
 */
const STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'because', 'before',
  'being', 'below', 'between', 'during', 'further', 'having', 'itself',
  'other', 'should', 'their', 'themselves', 'these', 'those', 'through',
  'under', 'until', 'which', 'while', 'whose', 'would', 'could', 'should',
])
function longestDistinctiveWord(text: string): string {
  const words = text.toLowerCase().match(/[a-z]{6,}/g) ?? []
  let best = ''
  for (const w of words) {
    if (STOPWORDS.has(w)) continue
    if (w.length > best.length) best = w
  }
  return best
}

export const useReaderDomStore = create<ReaderDomStore>((set, get) => ({
  markdownBody: null,

  setMarkdownBody: (el) => set({ markdownBody: el }),

  scrollToEvidence: (quote) => {
    const el = get().markdownBody
    if (!el || !quote) return false

    const map = buildOffsetMap(el)
    if (map.totalLength === 0) return false

    const tryMatch = (needle: string): boolean => {
      if (!needle) return false
      const hits = map.findAll(needle, { caseInsensitive: true })
      if (hits.length === 0) return false
      const [start, end] = hits[0]
      const range = map.createRange(start, end)
      if (!range) return false
      scrollRangeIntoView(range, { highlight: true })
      return true
    }

    // Strategy 1: exact (case-insensitive) match on the whole quote.
    if (tryMatch(quote.trim())) return true

    // Strategy 2: first "sentence" of the quote — evidence often has
    // trailing citation metadata or a summarization suffix that won't
    // appear verbatim in the source.
    const sentence = firstSentence(quote)
    if (sentence && sentence !== quote.trim() && tryMatch(sentence)) return true

    // Strategy 3: longest distinctive word. Last resort — still useful
    // because it at least lands the user near the relevant passage.
    const word = longestDistinctiveWord(quote)
    if (word && tryMatch(word)) return true

    return false
  },
}))

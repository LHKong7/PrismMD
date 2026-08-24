/**
 * Result fusion and snippet building.
 *
 * ★ Why fusion rather than one score: the signals a knowledge base has are
 * not comparable. BM25 is an unbounded negative number, link distance is a
 * small integer, recency is a timestamp. Normalizing them onto a shared
 * scale means inventing weights that are wrong on the next corpus.
 * Reciprocal Rank Fusion only looks at each signal's *ordering*, so a new
 * signal can be added without re-tuning the old ones.
 */

export interface RankedItem {
  id: string
  /** Optional per-item payload carried through fusion untouched. */
  [key: string]: unknown
}

export interface FusionList<T extends RankedItem> {
  items: T[]
  /** Relative importance of this signal. Defaults to 1. */
  weight?: number
}

export interface FusedResult<T extends RankedItem> {
  item: T
  score: number
  /** Which input lists contributed, in order of contribution. */
  signals: number[]
}

/**
 * Reciprocal Rank Fusion. `k` damps the head of each list so the top hit of
 * a weak signal cannot outvote the top three of a strong one; 60 is the
 * value from the original TREC paper and behaves well at our list sizes.
 */
export function reciprocalRankFusion<T extends RankedItem>(
  lists: FusionList<T>[],
  k = 60,
): FusedResult<T>[] {
  const byId = new Map<string, FusedResult<T>>()

  lists.forEach((list, listIndex) => {
    const weight = list.weight ?? 1
    list.items.forEach((item, rank) => {
      const contribution = (weight * 1) / (k + rank + 1)
      const existing = byId.get(item.id)
      if (existing) {
        existing.score += contribution
        existing.signals.push(listIndex)
        // Merge payload fields the earlier list did not carry, without
        // letting a later, weaker list overwrite a stronger one's values.
        for (const [key, value] of Object.entries(item)) {
          if (existing.item[key] === undefined) (existing.item as Record<string, unknown>)[key] = value
        }
      } else {
        byId.set(item.id, { item: { ...item }, score: contribution, signals: [listIndex] })
      }
    })
  })

  return [...byId.values()].sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
}

/**
 * Cut a readable excerpt out of `text` around the densest cluster of query
 * terms, so a search result shows *why* it matched.
 *
 * Matching is substring-based on the normalized terms rather than
 * re-tokenizing: the terms arriving here are already index terms (including
 * CJK bigrams), and a bigram is by definition a substring of the source.
 */
export function buildSnippet(text: string, terms: string[], maxLen = 240): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLen) return clean
  if (terms.length === 0) return `${clean.slice(0, maxLen).trimEnd()}…`

  const haystack = clean.toLowerCase()
  const hits: number[] = []
  for (const term of terms) {
    if (!term) continue
    let from = 0
    for (;;) {
      const at = haystack.indexOf(term, from)
      if (at < 0) break
      hits.push(at)
      from = at + term.length
      if (hits.length > 500) break
    }
  }
  if (hits.length === 0) return `${clean.slice(0, maxLen).trimEnd()}…`

  hits.sort((a, b) => a - b)
  // Slide a window of maxLen over the hit positions and keep the densest.
  let best = hits[0]
  let bestCount = 0
  let right = 0
  for (let left = 0; left < hits.length; left++) {
    while (right < hits.length && hits[right] - hits[left] <= maxLen) right++
    const count = right - left
    if (count > bestCount) {
      bestCount = count
      best = hits[left]
    }
  }

  let start = Math.max(0, best - Math.floor(maxLen / 4))
  // Prefer starting at a word boundary so the excerpt does not open mid-word.
  if (start > 0) {
    const space = clean.indexOf(' ', start)
    if (space >= 0 && space - start < 24) start = space + 1
  }
  const end = Math.min(clean.length, start + maxLen)
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`
}

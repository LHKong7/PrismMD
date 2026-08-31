/**
 * Bilingual tokenizer for the note index.
 *
 * ★ Why we tokenize in TypeScript instead of letting FTS5 do it:
 * SQLite's `unicode61` tokenizer classifies CJK ideographs as ordinary
 * letters, so a run of them has no word boundary and an entire Chinese
 * sentence collapses into a *single* token. Indexing 「机器学习的笔记」 that
 * way makes it findable only by typing that exact sentence back — search in
 * Chinese silently returns nothing, which is the worst kind of broken.
 * The `trigram` tokenizer fixes CJK but ruins English (no word boundaries,
 * no prefix queries), and this repo is bilingual by default.
 *
 * So we normalize here and hand FTS5 a pre-tokenized, space-separated
 * document: Latin runs become lowercase words, CJK runs become overlapping
 * bigrams. `unicode61` then just splits on the spaces we inserted. Queries
 * go through the exact same function, so index and query always agree.
 */

/**
 * CJK ranges we bigram: unified ideographs (+ extension A), compatibility
 * ideographs, hiragana/katakana, and Hangul syllables.
 */
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/

/** A latin/digit token: letters, digits, and the joiners that live inside words. */
const WORD_RE = /[A-Za-z0-9\u00C0-\u024F]+(?:['\u2018\u2019][A-Za-z]+)?/g

/**
 * Terms so common they match everything and rank nothing. Kept deliberately
 * short: an aggressive stopword list is how "to be or not to be" becomes
 * unsearchable. Chinese particles need no list — they are single characters
 * and get absorbed into bigrams with their neighbours.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how',
  'i', 'if', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this',
  'to', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'will', 'with',
  'you', 'your',
])

/**
 * A deliberately small English suffix stripper.
 *
 * ★ Without it, "retries" does not find the note that says "retry" — and the
 * single most common way to search your own notes is to half-remember the
 * word in a different form than you wrote it. A full Porter stemmer would be
 * more accurate, but the property that actually matters is that *index and
 * query go through the same function*: an imperfect rule applied to both
 * sides still matches, while a perfect rule applied to one side never does.
 * The suffixes below are the ones that pay for themselves; anything more
 * aggressive starts merging words that mean different things.
 */
export function stem(word: string): string {
  if (word.length < 4) return word
  // `ss`, `us`, `is` are almost never plurals (class, status, analysis).
  if (/(ss|us|is)$/.test(word)) return word
  if (word.length >= 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('s')) return word.slice(0, -1)
  if (word.length >= 6 && word.endsWith('ing')) return undouble(word.slice(0, -3))
  if (word.length >= 5 && word.endsWith('ed')) return undouble(word.slice(0, -2))
  return word
}

/** `runn` -> `run`, so `running` and `run` land on the same term. */
function undouble(word: string): string {
  const last = word.at(-1)
  if (last && last === word.at(-2) && !'aeiou'.includes(last)) return word.slice(0, -1)
  return word
}

/**
 * Split `text` into index terms.
 *
 * Latin runs are lowercased and split on anything that is not a letter or a
 * digit, so `use-effect` and `use_effect` both index as `use` + `effect` and
 * either spelling finds the other. CJK runs yield overlapping
 * bigrams (`机器学习` → `机器`, `器学`, `学习`), which is what makes substring
 * recall work without a dictionary segmenter; a lone CJK character is emitted
 * as itself so single-character queries still hit.
 */
export function tokenize(text: string, options?: { dropStopwords?: boolean }): string[] {
  if (!text) return []
  const dropStopwords = options?.dropStopwords ?? false
  const out: string[] = []

  // Walk the string once, splitting it into CJK runs and everything else.
  let buffer = ''
  const flushLatin = () => {
    if (!buffer) return
    for (const m of buffer.matchAll(WORD_RE)) {
      const word = m[0].toLowerCase()
      // Stopwords are matched *before* stemming, so the list can stay written
      // in ordinary English rather than in stemmer output.
      if (dropStopwords && STOPWORDS.has(word)) continue
      out.push(stem(word))
    }
    buffer = ''
  }

  let cjkRun = ''
  const flushCjk = () => {
    if (!cjkRun) return
    if (cjkRun.length === 1) {
      out.push(cjkRun)
    } else {
      for (let i = 0; i < cjkRun.length - 1; i++) out.push(cjkRun.slice(i, i + 2))
    }
    cjkRun = ''
  }

  for (const ch of text) {
    if (CJK_RE.test(ch)) {
      flushLatin()
      cjkRun += ch
    } else {
      flushCjk()
      buffer += ch
    }
  }
  flushLatin()
  flushCjk()

  return out
}

/**
 * The text we actually store in the FTS5 `body` column: terms joined by
 * spaces so `unicode61` reproduces exactly the tokens `tokenize()` produced.
 */
export function toIndexDocument(text: string): string {
  return tokenize(text).join(' ')
}

/**
 * Build an FTS5 MATCH expression for a user query.
 *
 * Terms are OR-ed rather than AND-ed on purpose: people ask their notes
 * whole questions ("what did I decide about the scheduler retry?"), and
 * requiring every term returns nothing. BM25 does the discrimination —
 * a chunk matching four terms outranks one matching one.
 *
 * Every term is double-quoted so FTS5 operators inside user text
 * (`AND`, `*`, `-`, `:`) are matched literally instead of parsed.
 * Returns `null` when nothing survives tokenization, which callers must
 * treat as "no query", never as "match everything".
 */
export function toMatchQuery(query: string, options?: { limitTerms?: number }): string | null {
  const limit = options?.limitTerms ?? 32
  const terms = dedupe(tokenize(query, { dropStopwords: true }))
  if (terms.length === 0) {
    // A query of pure stopwords ("what is it") still deserves an attempt.
    const raw = dedupe(tokenize(query))
    if (raw.length === 0) return null
    return raw.slice(0, limit).map(quote).join(' OR ')
  }
  return terms.slice(0, limit).map(quote).join(' OR ')
}

function quote(term: string): string {
  return `"${term.replace(/"/g, '""')}"`
}

function dedupe(terms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of terms) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/**
 * The terms of `text` ranked by in-document frequency, used to turn a note
 * into a "more like this" query. Stopwords and single Latin letters are
 * dropped; CJK bigrams are kept because they carry the meaning.
 */
export function salientTerms(text: string, max = 24): string[] {
  const counts = new Map<string, number>()
  for (const term of tokenize(text, { dropStopwords: true })) {
    if (term.length === 1 && !CJK_RE.test(term)) continue
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([term]) => term)
}

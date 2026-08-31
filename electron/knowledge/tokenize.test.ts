/**
 * The whole point of a hand-rolled tokenizer is Chinese recall, so that is
 * what these assert hardest: the failure it exists to prevent is a Chinese
 * query silently matching nothing.
 */
import { describe, expect, it } from 'vitest'
import { salientTerms, stem, tokenize, toIndexDocument, toMatchQuery } from './tokenize'

describe('tokenize', () => {
  it('lowercases latin words and splits on punctuation', () => {
    expect(tokenize('Use-Effect and use_effect, Hooks!')).toEqual([
      'use', 'effect', 'and', 'use', 'effect', 'hook',
    ])
  })

  it('keeps digits and version-like runs findable', () => {
    expect(tokenize('SQLite 3.45 FTS5')).toEqual(['sqlite', '3', '45', 'fts5'])
  })

  it('emits overlapping bigrams for CJK so a substring query still hits', () => {
    expect(tokenize('机器学习')).toEqual(['机器', '器学', '学习'])
  })

  it('emits a lone CJK character as itself', () => {
    expect(tokenize('道')).toEqual(['道'])
  })

  it('handles mixed scripts in one line', () => {
    expect(tokenize('用 SQLite 做全文检索')).toEqual([
      '用', 'sqlite', '做全', '全文', '文检', '检索',
    ])
  })

  it('returns nothing for punctuation-only input', () => {
    expect(tokenize('— … !!! ——')).toEqual([])
  })

  it('drops stopwords only when asked', () => {
    expect(tokenize('the scheduler', { dropStopwords: true })).toEqual(['scheduler'])
    expect(tokenize('the scheduler')).toEqual(['the', 'scheduler'])
  })
})

describe('toIndexDocument', () => {
  it('produces a space-separated document unicode61 can re-split', () => {
    // Every emitted token must be free of the space we join on, or FTS5
    // would tokenize it differently than tokenize() did.
    const doc = toIndexDocument('机器学习 with SQLite')
    expect(doc).toBe('机器 器学 学习 with sqlite')
    expect(doc.split(' ')).toEqual(tokenize('机器学习 with SQLite'))
  })
})

describe('toMatchQuery', () => {
  it('ORs terms so a natural-language question still retrieves', () => {
    expect(toMatchQuery('what did I decide about retries?')).toBe(
      '"did" OR "decide" OR "about" OR "retry"',
    )
  })

  it('quotes terms so FTS5 operators in user text stay literal', () => {
    // Unquoted, `AND`/`NOT`/`*` would be parsed as query syntax and either
    // change the meaning or throw a syntax error at the user.
    const q = toMatchQuery('NOT foo* OR bar')
    expect(q).toBe('"not" OR "foo" OR "bar"')
  })

  it('falls back to stopwords rather than returning nothing', () => {
    expect(toMatchQuery('what is it')).toBe('"what" OR "is" OR "it"')
  })

  it('returns null when there is nothing to search for', () => {
    expect(toMatchQuery('   ')).toBeNull()
    expect(toMatchQuery('!!!')).toBeNull()
  })

  it('deduplicates repeated terms', () => {
    expect(toMatchQuery('retry retry retry')).toBe('"retry"')
  })

  it('caps the number of terms so a pasted page cannot blow up the query', () => {
    const q = toMatchQuery(Array.from({ length: 200 }, (_, i) => `term${i}`).join(' '), { limitTerms: 5 })
    expect(q!.split(' OR ')).toHaveLength(5)
  })
})

describe('stem', () => {
  it('folds the word forms people actually mistype into each other', () => {
    // Each pair has to land on the same term or the note is unfindable from
    // the other spelling.
    for (const [a, b] of [
      ['retries', 'retry'],
      ['notes', 'note'],
      ['indexing', 'index'],
      ['indexed', 'index'],
      ['running', 'run'],
    ]) {
      expect(stem(a)).toBe(stem(b))
    }
  })

  it('leaves short words and non-plural -s endings alone', () => {
    expect(stem('is')).toBe('is')
    expect(stem('bus')).toBe('bus')
    expect(stem('class')).toBe('class')
    expect(stem('status')).toBe('status')
    expect(stem('analysis')).toBe('analysis')
  })

  it('is applied to queries and documents alike', () => {
    expect(tokenize('Retries')).toEqual(tokenize('retry'))
  })
})

describe('salientTerms', () => {
  it('ranks by in-document frequency', () => {
    const terms = salientTerms('scheduler scheduler scheduler retry retry backoff', 3)
    expect(terms).toEqual(['scheduler', 'retry', 'backoff'])
  })

  it('drops stopwords and stray single letters but keeps CJK bigrams', () => {
    expect(salientTerms('the a b 检索 检索')).toEqual(['检索'])
  })
})

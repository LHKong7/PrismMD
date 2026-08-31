import { describe, expect, it } from 'vitest'
import { buildSnippet, reciprocalRankFusion } from './rank'

describe('reciprocalRankFusion', () => {
  it('rewards an item that several signals agree on', () => {
    const fused = reciprocalRankFusion([
      { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      { items: [{ id: 'd' }, { id: 'b' }, { id: 'c' }] },
    ])
    // `b` places second in both lists; `a` and `d` each top one list but are
    // absent from the other. Agreement across signals is the point of fusing.
    expect(fused[0].item.id).toBe('b')
  })

  it('honours per-list weights', () => {
    const unweighted = reciprocalRankFusion([
      { items: [{ id: 'lex' }] },
      { items: [{ id: 'link' }] },
    ])
    expect(unweighted[0].item.id).toBe('lex') // tie broken by id

    const weighted = reciprocalRankFusion([
      { items: [{ id: 'lex' }], weight: 1 },
      { items: [{ id: 'link' }], weight: 5 },
    ])
    expect(weighted[0].item.id).toBe('link')
  })

  it('records which signals contributed', () => {
    const fused = reciprocalRankFusion([
      { items: [{ id: 'a' }] },
      { items: [{ id: 'a' }] },
      { items: [{ id: 'b' }] },
    ])
    expect(fused.find((f) => f.item.id === 'a')!.signals).toEqual([0, 1])
    expect(fused.find((f) => f.item.id === 'b')!.signals).toEqual([2])
  })

  it('merges payload fields without letting a weaker list overwrite a stronger one', () => {
    const fused = reciprocalRankFusion([
      { items: [{ id: 'a', title: 'from lexical' }] },
      { items: [{ id: 'a', title: 'from links', updatedAt: 7 }] },
    ])
    expect(fused[0].item.title).toBe('from lexical')
    expect(fused[0].item.updatedAt).toBe(7)
  })

  it('does not mutate the caller\'s items', () => {
    const item: { id: string; extra?: number } = { id: 'a' }
    reciprocalRankFusion([{ items: [item] }, { items: [{ id: 'a', extra: 1 }] }])
    expect(item).toEqual({ id: 'a' })
  })

  it('returns nothing for no input', () => {
    expect(reciprocalRankFusion([])).toEqual([])
    expect(reciprocalRankFusion([{ items: [] }])).toEqual([])
  })
})

describe('buildSnippet', () => {
  it('returns short text untouched', () => {
    expect(buildSnippet('a short line', ['short'])).toBe('a short line')
  })

  it('centres the excerpt on the densest cluster of terms', () => {
    const text = `${'filler '.repeat(80)}retry backoff retry ${'filler '.repeat(80)}`
    const snippet = buildSnippet(text, ['retry', 'backoff'], 100)
    expect(snippet).toContain('backoff')
    expect(snippet.length).toBeLessThanOrEqual(104)
    expect(snippet.startsWith('…')).toBe(true)
  })

  it('falls back to the head of the text when nothing matches', () => {
    const text = 'x'.repeat(500)
    const snippet = buildSnippet(text, ['nothing'], 50)
    expect(snippet).toBe('x'.repeat(50) + '…')
  })

  it('works with CJK bigram terms', () => {
    const text = `${'甲'.repeat(200)}机器学习${'乙'.repeat(200)}`
    expect(buildSnippet(text, ['机器', '器学'], 60)).toContain('机器学习')
  })

  it('collapses whitespace so a snippet is one readable line', () => {
    expect(buildSnippet('a\n\n  b\tc', ['b'])).toBe('a b c')
  })
})

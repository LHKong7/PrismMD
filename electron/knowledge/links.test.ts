import { describe, expect, it } from 'vitest'
import {
  collapseLinks,
  extractTags,
  extractWikiLinks,
  maskCode,
  normalizeTitle,
  rewriteWikiLinks,
} from './links'

describe('normalizeTitle', () => {
  it('case-folds and collapses whitespace', () => {
    expect(normalizeTitle('  Kalman   Filter ')).toBe('kalman filter')
  })

  it('keeps punctuation, because two titles differing only there are two notes', () => {
    expect(normalizeTitle('Chapter 1: Setup')).not.toBe(normalizeTitle('Chapter 1 Setup'))
  })
})

describe('maskCode', () => {
  it('preserves length and line structure so offsets stay valid', () => {
    const src = 'a\n```\nsecret\n```\nb `inline` c\n'
    const masked = maskCode(src)
    expect(masked).toHaveLength(src.length)
    expect(masked.split('\n')).toHaveLength(src.split('\n').length)
    expect(masked).not.toContain('secret')
    expect(masked).not.toContain('inline')
  })

  it('masks an unterminated fence to the end of the document', () => {
    const masked = maskCode('intro\n```\n[[Ghost]]\n')
    expect(masked).not.toContain('Ghost')
    expect(masked).toContain('intro')
  })
})

describe('extractWikiLinks', () => {
  it('reads plain, aliased, and heading-anchored links', () => {
    const links = extractWikiLinks('see [[Kalman Filter]], [[Notes#Retry|the retry bit]]')
    expect(links.map((l) => [l.target, l.heading, l.alias])).toEqual([
      ['Kalman Filter', null, null],
      ['Notes', 'Retry', 'the retry bit'],
    ])
  })

  it('normalizes the target for matching but keeps what was typed', () => {
    const [link] = extractWikiLinks('[[  Kalman   Filter ]]')
    expect(link.normalized).toBe('kalman filter')
    expect(link.target).toBe('Kalman   Filter')
  })

  it('offsets point at the real span in the source', () => {
    const src = 'prefix [[Target]] suffix'
    const [link] = extractWikiLinks(src)
    expect(src.slice(link.start, link.end)).toBe('[[Target]]')
  })

  it('ignores links inside code, which are examples and not edges', () => {
    const src = 'real [[Yes]]\n\n```md\n[[No]]\n```\n\nand `[[AlsoNo]]`'
    expect(extractWikiLinks(src).map((l) => l.target)).toEqual(['Yes'])
  })

  it('handles CJK titles', () => {
    expect(extractWikiLinks('参见[[卡尔曼滤波]]').map((l) => l.target)).toEqual(['卡尔曼滤波'])
  })

  it('does not match an unclosed or empty link', () => {
    expect(extractWikiLinks('[[unclosed')).toEqual([])
    expect(extractWikiLinks('[[]]')).toEqual([])
    expect(extractWikiLinks('[[   ]]')).toEqual([])
  })
})

describe('extractTags', () => {
  it('reads hash tags including nested and CJK ones', () => {
    expect(extractTags('todo #inbox #project/apos #中文标签').map((t) => t.tag))
      .toEqual(['inbox', 'project/apos', '中文标签'])
  })

  it('is not fooled by C# or issue#12', () => {
    expect(extractTags('writing C# for issue#12').map((t) => t.tag)).toEqual([])
  })

  it('does not treat markdown headings as tags', () => {
    expect(extractTags('# Heading\n\n## Another\n').map((t) => t.tag)).toEqual([])
  })

  it('lowercases so #Inbox and #inbox are one tag', () => {
    expect(extractTags('a #Inbox b #inbox').map((t) => t.tag)).toEqual(['inbox', 'inbox'])
  })

  it('ignores tags inside code', () => {
    expect(extractTags('x `#nope` y\n\n```\n#alsonope\n```\n').map((t) => t.tag)).toEqual([])
  })
})

describe('collapseLinks', () => {
  it('turns repeated mentions into one weighted edge', () => {
    const collapsed = collapseLinks(extractWikiLinks('[[A]] [[a]] [[A|alias]] [[B]]'))
    expect(collapsed.map((c) => [c.normalized, c.occurrences])).toEqual([['a', 3], ['b', 1]])
  })
})

describe('rewriteWikiLinks', () => {
  it('follows a rename across case variants while keeping alias and heading', () => {
    const src = 'see [[kalman filter]] and [[Kalman Filter#Update|the update step]]'
    expect(rewriteWikiLinks(src, 'Kalman Filter', 'Kalman Smoother')).toBe(
      'see [[Kalman Smoother]] and [[Kalman Smoother#Update|the update step]]',
    )
  })

  it('leaves other links and plain text alone', () => {
    const src = 'text [[Other]] and [[Kalman Filter]] tail'
    expect(rewriteWikiLinks(src, 'Kalman Filter', 'K')).toBe('text [[Other]] and [[K]] tail')
  })

  it('is a no-op when nothing matches or the title is unchanged', () => {
    expect(rewriteWikiLinks('[[A]]', 'B', 'C')).toBe('[[A]]')
    expect(rewriteWikiLinks('[[A]]', 'A', 'a')).toBe('[[A]]')
  })

  it('does not rewrite an example inside a code fence', () => {
    const src = '```\n[[Old]]\n```\n[[Old]]'
    expect(rewriteWikiLinks(src, 'Old', 'New')).toBe('```\n[[Old]]\n```\n[[New]]')
  })
})

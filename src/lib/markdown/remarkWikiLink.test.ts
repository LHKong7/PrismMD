/**
 * ★ The reader and the index each parse `[[links]]` with their own regex, in
 * two different processes. If they ever disagree, the failure is silent and
 * nasty: a link renders as a link but never appears in the target note's
 * backlinks (or the reverse). The parity test at the bottom is the guard.
 */
import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import { remarkWikiLink } from './remarkWikiLink'
import { extractWikiLinks } from '../../../electron/knowledge/links'

interface RenderedLink {
  target: string
  heading: string
  label: string
}

function parse(markdown: string): { links: RenderedLink[]; text: string } {
  const tree = unified().use(remarkParse).use(remarkWikiLink).parse(markdown) as Root
  unified().use(remarkWikiLink).runSync(tree)

  const links: RenderedLink[] = []
  const text: string[] = []
  visit(tree, (node: any) => {
    if (node.type === 'wikiLink') {
      const props = node.data?.hProperties ?? {}
      links.push({ target: props.target, heading: props.heading, label: props.label })
    } else if (node.type === 'text') {
      text.push(node.value)
    }
  })
  return { links, text: text.join('') }
}

describe('remarkWikiLink', () => {
  it('turns a plain link into a wiki-link node', () => {
    expect(parse('see [[Kalman Filter]] today').links).toEqual([
      { target: 'Kalman Filter', heading: '', label: 'Kalman Filter' },
    ])
  })

  it('keeps the alias as the visible label and the target as the destination', () => {
    expect(parse('[[Kalman Filter|the filter]]').links).toEqual([
      { target: 'Kalman Filter', heading: '', label: 'the filter' },
    ])
  })

  it('carries a heading fragment', () => {
    expect(parse('[[Notes#Retry|retries]]').links).toEqual([
      { target: 'Notes', heading: 'Retry', label: 'retries' },
    ])
  })

  it('preserves the surrounding prose exactly', () => {
    const { text } = parse('before [[Target]] after')
    expect(text).toBe('before Target after')
  })

  it('handles several links in one paragraph', () => {
    expect(parse('[[A]] and [[B]] and [[C]]').links.map((l) => l.target)).toEqual(['A', 'B', 'C'])
  })

  it('leaves inline code alone — an example is not a link', () => {
    expect(parse('write `[[Target]]` to link').links).toEqual([])
  })

  it('leaves a fenced block alone', () => {
    expect(parse('```md\n[[Target]]\n```\n').links).toEqual([])
  })

  it('leaves an empty or unclosed link as literal text', () => {
    expect(parse('[[]] and [[unclosed').links).toEqual([])
    expect(parse('[[]] and [[unclosed').text).toContain('[[]]')
  })

  it('handles CJK titles', () => {
    expect(parse('参见[[卡尔曼滤波]]。').links.map((l) => l.target)).toEqual(['卡尔曼滤波'])
  })
})

describe('parity with the index parser', () => {
  const cases = [
    'see [[Kalman Filter]] today',
    '[[Kalman Filter|the filter]]',
    '[[Notes#Retry|retries]]',
    '[[A]] and [[B]] and [[C]]',
    'write `[[Target]]` to link',
    '```md\n[[Target]]\n```\n',
    '[[]] and [[unclosed',
    '参见[[卡尔曼滤波]]。',
    'mixed [[One]] `[[Two]]` [[Three#H|alias]]',
  ]

  it.each(cases)('renderer and index agree on %j', (markdown) => {
    // Same targets, same order. A link the reader shows that the index does
    // not record is a backlink that never appears, with nothing to see.
    expect(parse(markdown).links.map((l) => l.target))
      .toEqual(extractWikiLinks(markdown).map((l) => l.target))
  })
})

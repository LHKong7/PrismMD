import { describe, expect, it } from 'vitest'
import { chunkMarkdown, splitSections } from './chunk'

describe('splitSections', () => {
  it('splits at ATX headings and tracks the heading path', () => {
    const md = '# Top\n\nintro\n\n## A\n\nbody a\n\n### A1\n\nbody a1\n\n## B\n\nbody b\n'
    expect(splitSections(md).map((s) => s.headingPath)).toEqual([
      ['Top'],
      ['Top', 'A'],
      ['Top', 'A', 'A1'],
      ['Top', 'B'],
    ])
  })

  it('keeps preamble text before the first heading', () => {
    const sections = splitSections('loose note\n\n# Later\n\nmore\n')
    expect(sections[0].headingPath).toEqual([])
    expect(sections).toHaveLength(2)
  })

  it('ignores headings inside fenced code', () => {
    // A `# comment` in a shell block is not a section boundary — treating it
    // as one splits the code fence across two chunks and neither renders.
    const md = '# Real\n\n```sh\n# not a heading\necho hi\n```\n\ntail\n'
    expect(splitSections(md).map((s) => s.headingPath)).toEqual([['Real']])
  })

  it('handles tilde fences and unbalanced markers', () => {
    const md = '# Real\n\n~~~\n# nope\n~~~\n\n## Second\n'
    expect(splitSections(md).map((s) => s.headingPath)).toEqual([['Real'], ['Real', 'Second']])
  })
})

describe('chunkMarkdown', () => {
  it('returns nothing for empty content', () => {
    expect(chunkMarkdown('')).toEqual([])
    expect(chunkMarkdown('   \n\n  ')).toEqual([])
  })

  it('offsets point back at the source text', () => {
    const md = '# Title\n\n' + 'x'.repeat(200) + '\n\n## Next\n\n' + 'y'.repeat(200) + '\n'
    for (const chunk of chunkMarkdown(md)) {
      expect(md.slice(chunk.start, chunk.end)).toBe(chunk.text)
    }
  })

  it('merges a runt section into the one that follows it', () => {
    const md = '## Notes\n\n## Detail\n\n' + 'z'.repeat(400) + '\n'
    const chunks = chunkMarkdown(md)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('## Notes')
    expect(chunks[0].text).toContain('## Detail')
  })

  it('splits an over-long section at paragraph boundaries', () => {
    const para = (n: number) => `paragraph ${n} ` + 'w'.repeat(300)
    const md = `# Long\n\n${[1, 2, 3, 4].map(para).join('\n\n')}\n`
    const chunks = chunkMarkdown(md, { maxChars: 400, overlapChars: 0 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.headingPath).toEqual(['Long'])
    // Every paragraph must survive somewhere — a splitter that drops text
    // makes the note unfindable and gives no sign of it.
    for (const n of [1, 2, 3, 4]) {
      expect(chunks.some((c) => c.text.includes(`paragraph ${n}`))).toBe(true)
    }
  })

  it('never cuts through a single over-long paragraph', () => {
    const md = '# Wall\n\n' + 'a'.repeat(5000) + '\n'
    const chunks = chunkMarkdown(md, { maxChars: 400 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('a'.repeat(5000))
  })

  it('numbers chunks consecutively from zero', () => {
    const md = '# A\n\n' + 'a'.repeat(300) + '\n\n# B\n\n' + 'b'.repeat(300) + '\n'
    expect(chunkMarkdown(md, { maxChars: 200, minChars: 10 }).map((c) => c.index))
      .toEqual([0, 1])
  })

  it('skips YAML front matter but keeps offsets honest', () => {
    const md = '---\ntitle: Meta\ntags: [x]\n---\n\n# Body\n\n' + 'p'.repeat(200) + '\n'
    const chunks = chunkMarkdown(md)
    expect(chunks[0].text.startsWith('# Body')).toBe(true)
    expect(md.slice(chunks[0].start, chunks[0].end)).toBe(chunks[0].text)
  })
})

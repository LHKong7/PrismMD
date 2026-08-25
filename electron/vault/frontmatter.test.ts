/**
 * The assertion that matters most here is preservation: PrismMD understands
 * five front matter fields and must not touch anything else, because the same
 * file is meant to open in Obsidian, in git and in a text editor.
 */
import { describe, expect, it } from 'vitest'
import { composeNote, parseNote, setFrontmatter } from './frontmatter'

describe('parseNote', () => {
  it('reads the fields PrismMD owns', () => {
    const note = parseNote(
      '---\nid: "abc-123"\ntitle: "PrismMD 架构"\ncreated: "2026-08-25T10:30:00+08:00"\n---\n\nbody\n',
    )
    expect(note.frontmatter).toMatchObject({
      id: 'abc-123',
      title: 'PrismMD 架构',
      created: '2026-08-25T10:30:00+08:00',
    })
    expect(note.body).toBe('\nbody\n')
  })

  it('reads bare scalars, not just quoted ones', () => {
    const note = parseNote('---\nid: abc-123\ntitle: Plain title\n---\nbody')
    expect(note.frontmatter.id).toBe('abc-123')
    expect(note.frontmatter.title).toBe('Plain title')
  })

  it('reads tags as a block sequence', () => {
    const note = parseNote('---\ntags:\n  - prismmd\n  - architecture\n---\nbody')
    expect(note.frontmatter.tags).toEqual(['prismmd', 'architecture'])
  })

  it('reads tags in flow style', () => {
    expect(parseNote('---\ntags: [a, b, c]\n---\nx').frontmatter.tags).toEqual(['a', 'b', 'c'])
  })

  it('treats a note with no front matter as all body', () => {
    const note = parseNote('# Just a heading\n\ntext')
    expect(note.frontmatter).toEqual({})
    expect(note.rawFrontmatter).toBeNull()
    expect(note.body).toBe('# Just a heading\n\ntext')
  })

  it('does not mistake a horizontal rule for front matter', () => {
    // ★ A `---` in the middle of a note is a rule. Reading it as front matter
    // would swallow everything above it.
    const source = 'intro\n\n---\n\nmore text\n'
    expect(parseNote(source).body).toBe(source)
    expect(parseNote(source).rawFrontmatter).toBeNull()
  })

  it('leaves an unterminated block as body rather than hiding the note', () => {
    const source = '---\nid: abc\n\nthe user kept typing\n'
    expect(parseNote(source).body).toBe(source)
    expect(parseNote(source).frontmatter).toEqual({})
  })

  it('keeps a # inside a title, which is not a YAML comment here', () => {
    expect(parseNote('---\ntitle: Issue #12 notes\n---\nx').frontmatter.title)
      .toBe('Issue #12 notes')
  })
})

describe('setFrontmatter', () => {
  it('adds a block to a note that had none, keeping the body intact', () => {
    const out = setFrontmatter('# Heading\n\nbody\n', { id: 'abc', title: 'T' })
    expect(out).toBe('---\nid: "abc"\ntitle: "T"\n---\n# Heading\n\nbody\n')
  })

  it('replaces only the key it owns', () => {
    const source = '---\nid: "old"\ntitle: "T"\n---\nbody'
    expect(setFrontmatter(source, { id: 'new' })).toBe('---\nid: "new"\ntitle: "T"\n---\nbody')
  })

  it('preserves fields, comments and ordering it does not understand', () => {
    // ★ The whole reason this module edits lines instead of round-tripping
    // YAML. A note that arrives from Obsidian has to leave unharmed.
    const source = [
      '---',
      '# a comment the user wrote',
      'aliases:',
      '  - Second name',
      'cssclass: wide',
      'id: "old"',
      'publish: true',
      '---',
      'body',
    ].join('\n')

    const out = setFrontmatter(source, { id: 'new' })
    expect(out).toContain('# a comment the user wrote')
    expect(out).toContain('aliases:\n  - Second name')
    expect(out).toContain('cssclass: wide')
    expect(out).toContain('publish: true')
    expect(out).toContain('id: "new"')
    expect(out).not.toContain('id: "old"')
    // Ordering survives too — the unknown keys stay above `id`.
    expect(out.indexOf('cssclass')).toBeLessThan(out.indexOf('id: "new"'))
  })

  it('does not touch the user\'s tags', () => {
    const source = '---\ntags:\n  - mine\nid: "a"\n---\nbody'
    expect(setFrontmatter(source, { title: 'X' })).toContain('tags:\n  - mine')
  })

  it('drops the continuation lines of a key it replaces', () => {
    const source = '---\ntitle:\n  - stray\n  - items\nid: "a"\n---\nbody'
    const out = setFrontmatter(source, { title: 'Now a scalar' })
    expect(out).toContain('title: "Now a scalar"')
    expect(out).not.toContain('stray')
    expect(out).toContain('id: "a"')
  })

  it('removes a key when passed null', () => {
    const out = setFrontmatter('---\nid: "a"\ntitle: "T"\n---\nbody', { title: null })
    expect(out).toBe('---\nid: "a"\n---\nbody')
  })

  it('removes the whole block when nothing is left', () => {
    expect(setFrontmatter('---\nid: "a"\n---\nbody', { id: null })).toBe('body')
  })

  it('escapes quotes and backslashes so the value survives a round trip', () => {
    const title = 'He said "hi" \\ then left'
    const out = setFrontmatter('body', { title })
    expect(parseNote(out).frontmatter.title).toBe(title)
  })

  it('round-trips titles that would break unquoted YAML', () => {
    for (const title of ['Chapter 1: Setup', 'true', 'no', '2026-08-25', '#tag', '[bracket]', '- dash']) {
      const out = setFrontmatter('body', { title })
      expect(parseNote(out).frontmatter.title).toBe(title)
    }
  })

  it('round-trips a CJK title', () => {
    const out = setFrontmatter('正文', { title: 'PrismMD 架构：第一章' })
    expect(parseNote(out).frontmatter.title).toBe('PrismMD 架构：第一章')
    expect(parseNote(out).body).toBe('正文')
  })

  it('is idempotent', () => {
    const once = setFrontmatter('body', { id: 'a', title: 'T' })
    expect(setFrontmatter(once, { id: 'a', title: 'T' })).toBe(once)
  })
})

describe('composeNote', () => {
  it('writes the owned fields and the tags it was given', () => {
    expect(composeNote({ id: 'a', title: 'T', tags: ['x', 'y'] }, '# Body\n')).toBe(
      '---\nid: "a"\ntitle: "T"\ntags:\n  - "x"\n  - "y"\n---\n# Body\n',
    )
  })

  it('emits no block at all when there is nothing to write', () => {
    expect(composeNote({}, 'body')).toBe('body')
  })

  it('produces something parseNote reads back identically', () => {
    const source = composeNote({ id: 'a', title: 'T: with colon', tags: ['t'] }, 'body')
    const parsed = parseNote(source)
    expect(parsed.frontmatter).toMatchObject({ id: 'a', title: 'T: with colon', tags: ['t'] })
    expect(parsed.body).toBe('body')
  })
})

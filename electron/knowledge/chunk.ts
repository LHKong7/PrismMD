/**
 * Heading-aware chunking for the note index.
 *
 * ★ Why chunks and not whole documents: a knowledge base answers questions
 * with *passages*. Ranking whole notes means a 4,000-word note about six
 * topics outranks a precise 80-word note on the one topic you asked about,
 * and the citation you get back points at "somewhere in this note". Chunks
 * carry their heading path, so a hit is addressable: "Deployment › Rollback".
 *
 * Section boundaries come from headings rather than a fixed window because
 * headings are the structure the *author* already imposed; splitting on
 * character count alone cuts arguments in half.
 */

export interface NoteChunk {
  /** Position of this chunk within the note, 0-based. */
  index: number
  /** Enclosing headings, outermost first. Empty for preamble text. */
  headingPath: string[]
  /** Chunk body, verbatim from the source (offsets below are into the source). */
  text: string
  start: number
  end: number
}

export interface ChunkOptions {
  /** Soft cap on a chunk's length; sections longer than this are split. */
  maxChars?: number
  /**
   * Sections shorter than this are merged into the following section rather
   * than indexed alone — a bare `## Notes` heading with one line under it is
   * noise on its own but useful attached to what follows.
   */
  minChars?: number
  /** Characters of tail repeated at the head of the next slice. */
  overlapChars?: number
}

const DEFAULTS = { maxChars: 1200, minChars: 120, overlapChars: 120 }

const ATX_HEADING_RE = /^(#{1,6})\s+(.*)$/
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/

interface Section {
  headingPath: string[]
  start: number
  end: number
}

/**
 * Split markdown into sections at ATX headings, honouring fenced code blocks
 * (a `# comment` inside a shell block is not a heading).
 */
export function splitSections(content: string): Section[] {
  const sections: Section[] = []
  const stack: { depth: number; title: string }[] = []

  let offset = 0
  let sectionStart = 0
  let currentPath: string[] = []
  let fence: string | null = null

  const push = (end: number) => {
    if (end > sectionStart) {
      sections.push({ headingPath: [...currentPath], start: sectionStart, end })
    }
  }

  const lines = content.split('\n')
  for (const line of lines) {
    const lineStart = offset
    offset += line.length + 1

    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence !== null) continue

    const heading = ATX_HEADING_RE.exec(line)
    if (!heading) continue

    push(lineStart)

    const depth = heading[1].length
    const title = heading[2].replace(/\s+#+\s*$/, '').trim()
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop()
    stack.push({ depth, title })
    currentPath = stack.map((s) => s.title).filter(Boolean)
    sectionStart = lineStart
  }

  push(content.length)
  return sections
}

/**
 * Chunk a markdown note. Returns an empty array for content with no
 * indexable text (whitespace, or a note that is only front matter).
 */
export function chunkMarkdown(content: string, options?: ChunkOptions): NoteChunk[] {
  const { maxChars, minChars, overlapChars } = { ...DEFAULTS, ...options }
  if (!content.trim()) return []

  const body = stripFrontMatter(content)
  const sections = splitSections(content).filter((s) => s.end > body.offset)

  const chunks: NoteChunk[] = []
  // A section too short to stand alone is carried forward and emitted
  // together with the next one, so a bare `## Notes` heading never becomes a
  // chunk whose entire content is its own title.
  let carry: { start: number; headingPath: string[] } | null = null

  for (const section of sections) {
    const start = Math.max(section.start, body.offset)
    if (!content.slice(start, section.end).trim()) continue

    // Read out of `carry` before writing back into it: assigning a value
    // derived from `carry` to `carry` in one expression is circular to infer.
    const carriedStart: number = carry ? carry.start : start
    const carriedPath: string[] | null = carry ? carry.headingPath : null

    if (content.slice(carriedStart, section.end).trim().length < minChars) {
      carry = { start: carriedStart, headingPath: carriedPath ?? section.headingPath }
      continue
    }
    // The bulk of the text belongs to this section, so its path is the one
    // that describes the chunk.
    emit({ headingPath: section.headingPath, start: carriedStart, end: section.end })
    carry = null
  }
  if (carry) emit({ headingPath: carry.headingPath, start: carry.start, end: content.length })

  return chunks

  function emit(section: Section) {
    for (const slice of sliceSection(content, section, { maxChars, minChars, overlapChars })) {
      chunks.push({
        index: chunks.length,
        headingPath: section.headingPath,
        text: slice.text,
        start: slice.start,
        end: slice.end,
      })
    }
  }
}

/**
 * Cut one section down to `maxChars`-sized slices at paragraph boundaries,
 * with a little overlap so a sentence straddling a cut is still retrievable
 * from both sides. A single paragraph longer than the cap is left whole:
 * a hard character cut through a table or a code block produces a chunk that
 * cites nothing legible.
 */
function sliceSection(
  content: string,
  section: Section,
  limits: { maxChars: number; minChars: number; overlapChars: number },
): { text: string; start: number; end: number }[] {
  const { maxChars, minChars, overlapChars } = limits
  const text = content.slice(section.start, section.end)
  if (text.length <= maxChars) {
    return [trimKeepingOffsets(text, section.start)]
  }

  const out: { text: string; start: number; end: number }[] = []
  const paragraphs = splitParagraphs(text, section.start)

  let bufStart = -1
  let bufEnd = -1
  const flush = () => {
    if (bufStart < 0) return
    out.push(trimKeepingOffsets(content.slice(bufStart, bufEnd), bufStart))
    bufStart = -1
    bufEnd = -1
  }

  for (const para of paragraphs) {
    if (bufStart < 0) {
      bufStart = para.start
      bufEnd = para.end
      continue
    }
    // Keep accumulating while the buffer still fits, and also while it is
    // too small to be worth citing — overshooting the cap beats emitting a
    // slice that is nothing but a heading line.
    if (para.end - bufStart <= maxChars || bufEnd - bufStart < minChars) {
      bufEnd = para.end
      continue
    }
    flush()
    // Re-enter with a little of the previous slice for context.
    bufStart = Math.max(section.start, para.start - overlapChars)
    bufEnd = para.end
  }
  flush()

  return out.filter((c) => c.text.trim().length > 0)
}

function splitParagraphs(text: string, base: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const re = /\n[ \t]*\n/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ start: base + last, end: base + m.index + m[0].length })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ start: base + last, end: base + text.length })
  return out
}

/**
 * Trim surrounding whitespace while keeping `start`/`end` pointing at the
 * real source positions — the offsets are what lets a search hit scroll the
 * reader to the passage instead of the top of the note.
 */
function trimKeepingOffsets(raw: string, base: number): { text: string; start: number; end: number } {
  const leading = raw.length - raw.trimStart().length
  const trimmed = raw.trim()
  return { text: trimmed, start: base + leading, end: base + leading + trimmed.length }
}

/** YAML front matter is metadata, not prose; skip it but keep the offsets honest. */
function stripFrontMatter(content: string): { offset: number } {
  if (!content.startsWith('---')) return { offset: 0 }
  const end = content.indexOf('\n---', 3)
  if (end < 0) return { offset: 0 }
  const after = content.indexOf('\n', end + 1)
  return { offset: after < 0 ? content.length : after + 1 }
}

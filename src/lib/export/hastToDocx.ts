import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ExternalHyperlink,
  BorderStyle,
  ShadingType,
  LevelFormat,
  Packer,
} from 'docx'
import type { Root, Element, Text, RootContent } from 'hast'

type HastNode = RootContent

const HEADING_MAP: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
}

function isElement(node: HastNode): node is Element {
  return node.type === 'element'
}

function isText(node: HastNode): node is Text {
  return node.type === 'text'
}

interface InlineOptions {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  font?: string
}

/** Extract inline TextRun elements from an element's children. */
function inlineChildren(node: Element, opts: InlineOptions = {}): TextRun[] {
  const runs: TextRun[] = []

  for (const child of node.children) {
    if (isText(child)) {
      const text = child.value
      if (!text) continue
      runs.push(new TextRun({ text, ...opts }))
    } else if (isElement(child)) {
      const tag = child.tagName
      if (tag === 'strong' || tag === 'b') {
        runs.push(...inlineChildren(child, { ...opts, bold: true }))
      } else if (tag === 'em' || tag === 'i') {
        runs.push(...inlineChildren(child, { ...opts, italics: true }))
      } else if (tag === 'del' || tag === 's') {
        runs.push(...inlineChildren(child, { ...opts, strike: true }))
      } else if (tag === 'code') {
        const text = getTextContent(child)
        runs.push(new TextRun({ text, font: 'Courier New', ...opts }))
      } else if (tag === 'a') {
        const href = (child.properties?.href as string) ?? ''
        const text = getTextContent(child)
        // ExternalHyperlink cannot be mixed into TextRun array directly,
        // so we render the link text as underlined blue text.
        runs.push(new TextRun({ text, color: '2563EB', underline: {}, ...opts }))
        if (href) {
          runs.push(new TextRun({ text: ` (${href})`, color: '868E96', size: 18, ...opts }))
        }
      } else if (tag === 'br') {
        runs.push(new TextRun({ break: 1 }))
      } else {
        // Recurse into unknown inline elements
        runs.push(...inlineChildren(child, opts))
      }
    }
  }

  return runs
}

function getTextContent(node: Element | HastNode): string {
  if (isText(node)) return node.value
  if (!isElement(node)) return ''
  return node.children.map((c) => getTextContent(c)).join('')
}

/** Convert a HAST element to docx Paragraph(s). */
function convertElement(node: Element, listLevel?: number): (Paragraph | Table)[] {
  const tag = node.tagName
  const results: (Paragraph | Table)[] = []

  // Headings
  if (HEADING_MAP[tag]) {
    results.push(
      new Paragraph({
        heading: HEADING_MAP[tag],
        children: inlineChildren(node),
        spacing: { before: 240, after: 120 },
      }),
    )
    return results
  }

  // Paragraph
  if (tag === 'p') {
    const children = inlineChildren(node)
    if (children.length > 0) {
      results.push(
        new Paragraph({
          children,
          spacing: { after: 120 },
          indent: listLevel != null ? { left: listLevel * 720 } : undefined,
        }),
      )
    }
    return results
  }

  // Lists
  if (tag === 'ul' || tag === 'ol') {
    const level = (listLevel ?? -1) + 1
    for (const child of node.children) {
      if (isElement(child) && child.tagName === 'li') {
        results.push(...convertListItem(child, tag === 'ol', level))
      }
    }
    return results
  }

  // Blockquote
  if (tag === 'blockquote') {
    for (const child of node.children) {
      if (isElement(child)) {
        const paras = convertElement(child)
        for (const p of paras) {
          if (p instanceof Paragraph) {
            results.push(
              new Paragraph({
                children: inlineChildren(child),
                indent: { left: 720 },
                border: {
                  left: { style: BorderStyle.SINGLE, size: 6, color: '868E96' },
                },
                spacing: { after: 80 },
              }),
            )
          } else {
            results.push(p)
          }
        }
      }
    }
    return results
  }

  // Code block
  if (tag === 'pre') {
    const codeEl = node.children.find((c) => isElement(c) && c.tagName === 'code') as Element | undefined
    const text = codeEl ? getTextContent(codeEl) : getTextContent(node)
    results.push(
      new Paragraph({
        children: [new TextRun({ text, font: 'Courier New', size: 20 })],
        shading: { type: ShadingType.SOLID, color: 'F4F4F5' },
        spacing: { before: 120, after: 120 },
      }),
    )
    return results
  }

  // Table
  if (tag === 'table') {
    const tableRows: TableRow[] = []
    const visit = (el: Element) => {
      for (const child of el.children) {
        if (!isElement(child)) continue
        if (child.tagName === 'thead' || child.tagName === 'tbody' || child.tagName === 'tfoot') {
          visit(child)
        } else if (child.tagName === 'tr') {
          const cells: TableCell[] = []
          for (const td of child.children) {
            if (isElement(td) && (td.tagName === 'td' || td.tagName === 'th')) {
              cells.push(
                new TableCell({
                  children: [new Paragraph({ children: inlineChildren(td, td.tagName === 'th' ? { bold: true } : {}) })],
                  width: { size: 0, type: WidthType.AUTO },
                }),
              )
            }
          }
          if (cells.length > 0) {
            tableRows.push(new TableRow({ children: cells }))
          }
        }
      }
    }
    visit(node)
    if (tableRows.length > 0) {
      results.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
    }
    return results
  }

  // Horizontal rule
  if (tag === 'hr') {
    results.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        spacing: { before: 200, after: 200 },
      }),
    )
    return results
  }

  // div / section / article — just recurse
  if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main') {
    for (const child of node.children) {
      if (isElement(child)) {
        results.push(...convertElement(child, listLevel))
      }
    }
    return results
  }

  // Fallback: try to extract text
  const text = getTextContent(node)
  if (text.trim()) {
    results.push(new Paragraph({ children: [new TextRun({ text })] }))
  }

  return results
}

function convertListItem(node: Element, ordered: boolean, level: number): Paragraph[] {
  const results: Paragraph[] = []

  for (const child of node.children) {
    if (isText(child) && child.value.trim()) {
      const bullet = ordered ? `${level + 1}. ` : '- '
      results.push(
        new Paragraph({
          children: [new TextRun({ text: `${bullet}${child.value.trim()}` })],
          indent: { left: level * 720 + 360 },
          spacing: { after: 40 },
        }),
      )
    } else if (isElement(child)) {
      if (child.tagName === 'ul' || child.tagName === 'ol') {
        results.push(...convertElement(child, level) as Paragraph[])
      } else {
        const runs = inlineChildren(child)
        if (runs.length > 0) {
          const bullet = ordered ? `${level + 1}. ` : '- '
          results.push(
            new Paragraph({
              children: [new TextRun({ text: bullet }), ...runs],
              indent: { left: level * 720 + 360 },
              spacing: { after: 40 },
            }),
          )
        }
      }
    }
  }

  return results
}

/**
 * Convert a rehype HAST tree to a DOCX buffer.
 */
export async function hastToDocxBuffer(hast: Root, title: string): Promise<ArrayBuffer> {
  const body: (Paragraph | Table)[] = []

  for (const node of hast.children) {
    if (isElement(node)) {
      body.push(...convertElement(node))
    }
  }

  // Ensure at least one paragraph
  if (body.length === 0) {
    body.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  }

  const doc = new Document({
    title,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: body,
      },
    ],
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
  })

  const buffer = await Packer.toBuffer(doc)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root } from 'mdast'
import type { Plugin } from 'unified'

export interface TocEntry {
  depth: number
  text: string
  id: string
}

interface RemarkTocOptions {
  onExtract: (entries: TocEntry[]) => void
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\u4e00-\u9fff\u3400-\u4dbf-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const remarkToc: Plugin<[RemarkTocOptions], Root> = (options) => {
  return (tree) => {
    const entries: TocEntry[] = []

    visit(tree, 'heading', (node) => {
      const text = toString(node)
      entries.push({
        depth: node.depth,
        text,
        id: slugify(text),
      })
    })

    options.onExtract(entries)
  }
}

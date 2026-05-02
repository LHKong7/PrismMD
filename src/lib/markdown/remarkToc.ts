import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import GithubSlugger from 'github-slugger'
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

/**
 * Remark plugin that extracts a table-of-contents from headings.
 *
 * Uses `github-slugger` to generate IDs that match `rehype-slug` exactly,
 * including deduplication of repeated heading text (e.g. "Foo", "Foo" → "foo", "foo-1").
 */
export const remarkToc: Plugin<[RemarkTocOptions], Root> = (options) => {
  return (tree) => {
    const entries: TocEntry[] = []
    const slugger = new GithubSlugger()

    visit(tree, 'heading', (node) => {
      const text = toString(node)
      entries.push({
        depth: node.depth,
        text,
        id: slugger.slug(text),
      })
    })

    options.onExtract(entries)
  }
}

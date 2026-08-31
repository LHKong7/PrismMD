import { visit } from 'unist-util-visit'
import type { Root, Text, PhrasingContent } from 'mdast'
import type { Plugin } from 'unified'

/**
 * Renders `[[Note Title]]` as a navigable link.
 *
 * ★ Why a markdown *extension* and not a stored reference: the link has to
 * survive leaving PrismMD. A note whose links only work inside this app is a
 * note held hostage — `[[Kalman Filter]]` is still legible in any editor, in
 * a diff, and in a git blame, and it is what Obsidian, Logseq and Roam users
 * already have in their files.
 *
 * The plugin only marks the span; resolution (does that note exist?) happens
 * in the `WikiLink` component, which can ask the index and re-render when the
 * answer changes. Deciding here would freeze the answer at parse time and
 * leave a link looking broken until the document was re-parsed.
 *
 * Supported forms:
 *   `[[Target]]`  `[[Target|shown text]]`  `[[Target#Heading]]`  `[[Target#Heading|shown]]`
 */

/** Kept in sync with `electron/knowledge/links.ts` — same syntax, two consumers. */
const WIKILINK_RE = /\[\[([^\]#|\n]+)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g

export const remarkWikiLink: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index == null) return
      // `inlineCode` and `code` are separate mdast node types, so a
      // `[[link]]` written inside backticks never reaches this visitor —
      // examples stay examples.
      WIKILINK_RE.lastIndex = 0
      if (!WIKILINK_RE.test(node.value)) return
      WIKILINK_RE.lastIndex = 0

      const children: PhrasingContent[] = []
      let cursor = 0
      let match: RegExpExecArray | null

      while ((match = WIKILINK_RE.exec(node.value)) !== null) {
        if (match.index > cursor) {
          children.push({ type: 'text', value: node.value.slice(cursor, match.index) })
        }

        const target = match[1].trim()
        const heading = match[2]?.trim() ?? ''
        const alias = match[3]?.trim() ?? ''

        if (!target) {
          // `[[]]` is not a link; leave the characters as the author typed them.
          children.push({ type: 'text', value: match[0] })
        } else {
          children.push({
            type: 'wikiLink',
            data: {
              hName: 'wiki-link',
              hProperties: { target, heading, label: alias || target },
            },
            children: [{ type: 'text', value: alias || target }],
          } as never)
        }

        cursor = match.index + match[0].length
      }

      if (cursor < node.value.length) {
        children.push({ type: 'text', value: node.value.slice(cursor) })
      }
      if (children.length === 0) return

      parent.children.splice(index, 1, ...(children as never[]))
      // Skip the nodes we just inserted; revisiting them would re-scan text
      // we already handled.
      return index + children.length
    })
  }
}

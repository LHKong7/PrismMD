import { visit } from 'unist-util-visit'
import type { Root, Blockquote, Paragraph, Text, PhrasingContent, BlockContent } from 'mdast'
import type { Plugin } from 'unified'

/**
 * Enhanced markdown syntax plugin.
 *
 * Adds support for:
 * 1. Callouts:   > [!note] Title \n > content
 * 2. Tabs:       :::tabs \n ::tab[Label] \n content \n :::
 * 3. Timelines:  :::timeline \n ::step[Label] \n content \n :::
 * 4. Badges:     ::badge[text]{color=green}
 */
export const remarkEnhanced: Plugin<[], Root> = () => {
  return (tree) => {
    transformCallouts(tree)
    transformContainers(tree)
    transformBadges(tree)
  }
}

// ─── Callouts ───────────────────────────────────────────────────────────────

const CALLOUT_RE = /^\[!(note|tip|warning|danger|info)\]\s*(.*)/i

function transformCallouts(tree: Root) {
  visit(tree, 'blockquote', (node: Blockquote, index, parent) => {
    if (!parent || index == null) return

    // Get the first paragraph's text
    const firstChild = node.children[0]
    if (!firstChild || firstChild.type !== 'paragraph') return

    const firstText = firstChild.children[0]
    if (!firstText || firstText.type !== 'text') return

    const match = firstText.value.match(CALLOUT_RE)
    if (!match) return

    const calloutType = match[1].toLowerCase()
    const title = match[2]?.trim() || ''

    // Remove the [!type] line from the content
    if (firstText.value.includes('\n')) {
      firstText.value = firstText.value.replace(CALLOUT_RE, '').replace(/^\n/, '')
    } else {
      // Remove the first text node entirely
      firstChild.children.shift()
      // If the paragraph is now empty, remove it
      if (firstChild.children.length === 0) {
        node.children.shift()
      }
    }

    // Transform blockquote into a callout div
    const data = node.data || (node.data = {})
    data.hName = 'callout'
    data.hProperties = {
      'data-type': calloutType,
      'data-title': title || calloutType.charAt(0).toUpperCase() + calloutType.slice(1),
    }
  })
}

// ─── Containers (Tabs + Timelines) ─────────────────────────────────────────

const CONTAINER_OPEN_RE = /^:::(tabs|timeline)\s*$/
const CONTAINER_CLOSE_RE = /^:::\s*$/
const ITEM_RE = /^::(tab|step)\[([^\]]*)\]\s*$/

function transformContainers(tree: Root) {
  // Walk top-level children looking for :::type ... ::: fence pairs
  const children = tree.children
  let i = 0

  while (i < children.length) {
    const node = children[i]
    if (node.type !== 'paragraph') { i++; continue }

    const text = getPlainText(node)
    const openMatch = text.match(CONTAINER_OPEN_RE)
    if (!openMatch) { i++; continue }

    const containerType = openMatch[1] // 'tabs' or 'timeline'
    const startIdx = i

    // Find closing :::
    let endIdx = -1
    for (let j = i + 1; j < children.length; j++) {
      const c = children[j]
      if (c.type === 'paragraph' && CONTAINER_CLOSE_RE.test(getPlainText(c))) {
        endIdx = j
        break
      }
    }

    if (endIdx < 0) { i++; continue }

    // Collect content between opening and closing
    const innerNodes = children.slice(startIdx + 1, endIdx)

    // Split by ::tab[label] or ::step[label] markers
    const itemTag = containerType === 'tabs' ? 'tab' : 'step'
    const items: { label: string; children: BlockContent[] }[] = []
    let current: { label: string; children: BlockContent[] } | null = null

    for (const inner of innerNodes) {
      if (inner.type === 'paragraph') {
        const t = getPlainText(inner)
        const itemMatch = t.match(ITEM_RE)
        if (itemMatch && itemMatch[1] === itemTag) {
          current = { label: itemMatch[2], children: [] }
          items.push(current)
          continue
        }
      }
      if (current) {
        current.children.push(inner as BlockContent)
      }
    }

    if (items.length === 0) { i++; continue }

    // Build the container node
    const hName = containerType === 'tabs' ? 'tabs-container' : 'timeline-container'
    const labels = items.map((it) => it.label)

    // Build item wrapper nodes
    const itemNodes: BlockContent[] = items.map((item) => ({
      type: 'paragraph' as const,
      children: [] as PhrasingContent[],
      data: {
        hName: `${containerType}-item`,
        hProperties: { 'data-label': item.label },
        hChildren: item.children.length > 0 ? undefined : undefined,
      },
      // Attach the item's children as actual MDAST children via a wrapper
    }))

    // Create the container as a blockquote (repurposed) with hName override
    const containerNode: BlockContent = {
      type: 'blockquote',
      children: [],
      data: {
        hName,
        hProperties: {
          'data-labels': JSON.stringify(labels),
        },
      },
    }

    // For each item, create a section with its children
    for (const item of items) {
      const section: BlockContent = {
        type: 'blockquote',
        children: item.children.length > 0 ? item.children : [
          { type: 'paragraph', children: [{ type: 'text', value: '' }] },
        ],
        data: {
          hName: `${containerType}-item`,
          hProperties: { 'data-label': item.label },
        },
      }
      containerNode.children.push(section as never)
    }

    // Replace the range [startIdx..endIdx] with the container node
    children.splice(startIdx, endIdx - startIdx + 1, containerNode)
    i = startIdx + 1
  }
}

// ─── Badges ─────────────────────────────────────────────────────────────────

const BADGE_RE = /::badge\[([^\]]+)\]\{color=([^}]+)\}/g

function transformBadges(tree: Root) {
  visit(tree, 'text', (node: Text, index, parent) => {
    if (!parent || index == null) return
    if (!BADGE_RE.test(node.value)) return
    BADGE_RE.lastIndex = 0

    const children: PhrasingContent[] = []
    let lastIdx = 0
    let match: RegExpExecArray | null

    while ((match = BADGE_RE.exec(node.value)) !== null) {
      // Text before the badge
      if (match.index > lastIdx) {
        children.push({ type: 'text', value: node.value.slice(lastIdx, match.index) })
      }

      // The badge itself — use an inline HTML node
      const badgeText = match[1]
      const badgeColor = match[2]
      children.push({
        type: 'html',
        value: `<span class="badge badge-${badgeColor}">${escapeHtml(badgeText)}</span>`,
      } as never)

      lastIdx = match.index + match[0].length
    }

    // Text after the last badge
    if (lastIdx < node.value.length) {
      children.push({ type: 'text', value: node.value.slice(lastIdx) })
    }

    if (children.length > 0) {
      parent.children.splice(index, 1, ...children as never[])
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPlainText(node: Paragraph): string {
  return node.children
    .map((c) => (c.type === 'text' ? c.value : ''))
    .join('')
    .trim()
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

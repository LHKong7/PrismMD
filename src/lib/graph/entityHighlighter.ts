/**
 * Opt-in entity linker.
 *
 * Given a DOM subtree of rendered markdown and a list of entity names,
 * wraps every matching occurrence with a clickable `<span class="ig-entity">`.
 * Used by the Reader when Knowledge Graph + entity linking are both on.
 *
 * The algorithm:
 *   1. Build a case-insensitive trie of entity names so matches happen
 *      in one pass rather than O(N · M) substring search.
 *   2. Walk `Text` nodes with a TreeWalker, skipping code/pre/anchor
 *      subtrees so we never shred existing formatting or create nested
 *      links.
 *   3. For each hit, split the text node around the match and insert a
 *      `<span>` carrying the entity name in a `data-entity` attribute
 *      plus a click handler.
 *
 * The inserted spans are always tagged with the `ig-entity-wrap` class so
 * a cleanup pass can undo the highlighting without touching the rest of
 * the document.
 */

export const ENTITY_CLASS = 'ig-entity'
export const ENTITY_WRAP_CLASS = 'ig-entity-wrap'
const ENTITY_DATA_ATTR = 'data-entity'

interface TrieNode {
  children: Map<string, TrieNode>
  /** Canonical entity name if a match ends here. */
  terminal?: string
}

function buildTrie(names: string[]): TrieNode {
  const root: TrieNode = { children: new Map() }
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    let cur = root
    // Case-insensitive: normalize key chars, keep the canonical name on
    // the terminal node so displayed text can differ from storage.
    for (const ch of name.toLowerCase()) {
      let next = cur.children.get(ch)
      if (!next) {
        next = { children: new Map() }
        cur.children.set(ch, next)
      }
      cur = next
    }
    // Prefer the longer name if a prefix collision happens (trie
    // traversal still finds the longest match first because we advance
    // greedily below).
    if (!cur.terminal || cur.terminal.length < name.length) {
      cur.terminal = name
    }
  }
  return root
}

function isWordBoundary(ch: string | undefined): boolean {
  if (!ch) return true
  // Unicode letter/digit detection keeps CJK, accents, etc. as "inside
  // word" so we don't highlight "NVIDIA" inside "NVIDIAS".
  return !/[\p{L}\p{N}_]/u.test(ch)
}

/**
 * Scan a string for the longest trie match starting at each position and
 * respecting word boundaries. Returns `[start, end, name]` tuples.
 */
function findMatches(text: string, trie: TrieNode): Array<[number, number, string]> {
  const out: Array<[number, number, string]> = []
  const lower = text.toLowerCase()
  let i = 0
  while (i < lower.length) {
    // Require a word boundary before the match start.
    if (!isWordBoundary(lower[i - 1])) {
      i++
      continue
    }
    let cur = trie
    let lastMatchEnd = -1
    let lastMatchName: string | null = null
    let j = i
    while (j < lower.length) {
      const next = cur.children.get(lower[j])
      if (!next) break
      cur = next
      j++
      if (cur.terminal && isWordBoundary(lower[j])) {
        lastMatchEnd = j
        lastMatchName = cur.terminal
      }
    }
    if (lastMatchName && lastMatchEnd > i) {
      out.push([i, lastMatchEnd, lastMatchName])
      i = lastMatchEnd
    } else {
      i++
    }
  }
  return out
}

/**
 * Returns true if a node is inside a subtree we don't want to touch
 * (existing link, inline code, code block, pre-formatted text, or
 * something we've already wrapped).
 */
function isSkippable(node: Node): boolean {
  let cur: Node | null = node.parentNode
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as Element
      const tag = el.tagName
      if (
        tag === 'A' ||
        tag === 'CODE' ||
        tag === 'PRE' ||
        tag === 'SCRIPT' ||
        tag === 'STYLE' ||
        el.classList.contains(ENTITY_WRAP_CLASS)
      ) {
        return true
      }
    }
    cur = cur.parentNode
  }
  return false
}

export interface EntityHighlightOptions {
  /** Invoked when a user clicks a wrapped entity. */
  onEntityClick?: (name: string) => void
}

/**
 * Wrap every entity occurrence inside `root` with clickable spans. Returns
 * a disposer that removes the spans without touching the surrounding
 * markup.
 */
export function highlightEntitiesIn(
  root: HTMLElement,
  entityNames: string[],
  opts: EntityHighlightOptions = {},
): () => void {
  if (entityNames.length === 0) return () => {}
  const trie = buildTrie(entityNames)

  // Collect text nodes first so we don't invalidate the TreeWalker by
  // splitting while we iterate.
  const targets: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || node.nodeValue.trim().length === 0) {
        return NodeFilter.FILTER_REJECT
      }
      return isSkippable(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    },
  })
  let n = walker.nextNode()
  while (n) {
    targets.push(n as Text)
    n = walker.nextNode()
  }

  const wraps: HTMLElement[] = []

  const onClick = (ev: Event) => {
    const target = ev.target as HTMLElement | null
    if (!target) return
    const wrap = target.closest(`.${ENTITY_WRAP_CLASS}`) as HTMLElement | null
    if (!wrap) return
    const name = wrap.getAttribute(ENTITY_DATA_ATTR)
    if (!name) return
    ev.preventDefault()
    ev.stopPropagation()
    opts.onEntityClick?.(name)
  }
  root.addEventListener('click', onClick)

  for (const textNode of targets) {
    const raw = textNode.nodeValue ?? ''
    const matches = findMatches(raw, trie)
    if (matches.length === 0) continue

    const frag = document.createDocumentFragment()
    let cursor = 0
    for (const [start, end, name] of matches) {
      if (start > cursor) {
        frag.appendChild(document.createTextNode(raw.slice(cursor, start)))
      }
      const span = document.createElement('span')
      span.className = `${ENTITY_WRAP_CLASS} ${ENTITY_CLASS}`
      span.setAttribute(ENTITY_DATA_ATTR, name)
      span.setAttribute('role', 'button')
      span.setAttribute('tabindex', '0')
      span.textContent = raw.slice(start, end)
      frag.appendChild(span)
      wraps.push(span)
      cursor = end
    }
    if (cursor < raw.length) {
      frag.appendChild(document.createTextNode(raw.slice(cursor)))
    }
    textNode.replaceWith(frag)
  }

  // Disposer: unwrap every span we inserted, merging the text back into
  // its parent. Leaves the rest of the DOM intact.
  return () => {
    root.removeEventListener('click', onClick)
    for (const span of wraps) {
      const parent = span.parentNode
      if (!parent) continue
      parent.replaceChild(document.createTextNode(span.textContent ?? ''), span)
      parent.normalize()
    }
  }
}

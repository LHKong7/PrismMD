import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { useWorkspaceStore } from '../../store/workspaceStore'
import type { PageTreeNode } from '../../types/electron'

/**
 * `[[` autocomplete over the titles of every note in the workspace.
 *
 * ★ Without completion, wiki-links only work if you remember exactly how you
 * titled a note two months ago — and a link that silently fails to resolve
 * because you typed "Kalman filters" instead of "Kalman Filter" is worse than
 * no link, because nothing tells you it did not connect. Completion turns the
 * link syntax from a memory test into a picker.
 *
 * Titles come from the page tree the sidebar already holds, so typing stays
 * synchronous: an IPC round trip per keystroke would make the popup lag
 * behind the cursor.
 */

function flattenNotes(nodes: PageTreeNode[], into: { title: string; id: string }[]): void {
  for (const node of nodes) {
    // Folders are containers; there is nothing to open at the other end of a
    // link to one.
    if (!node.isFolder && node.title.trim()) into.push({ title: node.title, id: node.id })
    if (node.children?.length) flattenNotes(node.children, into)
  }
}

export function wikiLinkCompletions(context: CompletionContext): CompletionResult | null {
  // Everything typed since the opening `[[`, stopping at a closing bracket or
  // a line break so a finished link does not keep re-triggering the popup.
  const match = context.matchBefore(/\[\[[^\]\n]*/)
  if (!match) return null

  const notes: { title: string; id: string }[] = []
  flattenNotes(useWorkspaceStore.getState().pageTree, notes)

  const seen = new Set<string>()
  const options = notes
    .filter((note) => {
      const key = note.title.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((note) => ({
      label: note.title,
      type: 'text',
      // Close the link for the user. Typing `]]` yourself is the step people
      // forget, and an unclosed `[[` is just text.
      apply: `${note.title}]]`,
    }))

  return {
    from: match.from + 2,
    options,
    // Titles that do not match what has been typed are filtered out by
    // CodeMirror; an empty query lists everything, which is the browse case.
    filter: true,
  }
}

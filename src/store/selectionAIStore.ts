import { create } from 'zustand'

/**
 * Store that backs the "selection AI actions" flow:
 *
 *   select text → pick action (Explain / Translate / Simplify)
 *   → bubble opens next to the selection
 *   → calls `sendAgentOneShot` → streams status (`pending` → `done|error`)
 *
 * The color-picker popover and the AI-result bubble are two different
 * components, so we lift the state here rather than pass props through
 * MarkdownReader.
 */

export type SelectionAIAction = 'explain' | 'translate' | 'simplify' | 'find-similar'

export interface SelectionAIAnchor {
  /** Screen-space coordinates (same space as HighlightPopover). */
  x: number
  y: number
}

export interface SelectionAIState {
  action: SelectionAIAction
  /** The text the user had selected when they triggered the action. */
  selectedText: string
  anchor: SelectionAIAnchor
  status: 'pending' | 'done' | 'error'
  /** The AI reply when `status === 'done'`. */
  reply?: string
  /** Error message when `status === 'error'`. */
  error?: string
  /** Monotonically increasing id so stale responses can be ignored. */
  requestId: number
}

interface SelectionAIStore {
  current: SelectionAIState | null

  /** Begin an action. Opens the bubble in `pending`; caller runs the IPC. */
  startAction: (params: {
    action: SelectionAIAction
    selectedText: string
    anchor: SelectionAIAnchor
  }) => number
  /** Finish an in-flight action with a successful reply. */
  completeAction: (requestId: number, reply: string) => void
  /** Finish an in-flight action with an error. */
  failAction: (requestId: number, error: string) => void
  /** Dismiss the bubble. */
  dismiss: () => void
}

let requestSeq = 0

export const useSelectionAIStore = create<SelectionAIStore>((set, get) => ({
  current: null,

  startAction: ({ action, selectedText, anchor }) => {
    const requestId = ++requestSeq
    set({
      current: {
        action,
        selectedText,
        anchor,
        status: 'pending',
        requestId,
      },
    })
    return requestId
  },

  completeAction: (requestId, reply) => {
    const cur = get().current
    // Ignore stale responses if the user has moved on.
    if (!cur || cur.requestId !== requestId) return
    set({ current: { ...cur, status: 'done', reply } })
  },

  failAction: (requestId, error) => {
    const cur = get().current
    if (!cur || cur.requestId !== requestId) return
    set({ current: { ...cur, status: 'error', error } })
  },

  dismiss: () => set({ current: null }),
}))

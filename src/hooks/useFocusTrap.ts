import { useEffect, type RefObject } from 'react'

/**
 * Trap Tab/Shift-Tab navigation inside the element referenced by `ref`
 * while `active` is true. Without this, modals like SettingsPanel and
 * the CommandPalette would let keyboard focus escape into the
 * background reader, which is a WCAG 2.1 dialog violation and just
 * generally disorienting.
 *
 * Implementation notes:
 * - We re-query focusable descendants on every Tab so the trap stays
 *   correct as the dialog content changes (tab switches, async loads).
 * - We only act when the user actually pressed Tab; everything else is
 *   left to native handling so screen readers still get arrow-key /
 *   typeahead behaviour inside e.g. cmdk's listbox.
 * - On activation we move focus into the dialog if it isn't already
 *   there — otherwise the first Tab would jump to whatever happened to
 *   be focused before the dialog opened.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Pull initial focus into the dialog if it's outside.
    if (!root.contains(document.activeElement)) {
      const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('inert') && el.offsetParent !== null)
      if (focusable.length === 0) {
        // Nothing focusable — keep focus on the dialog itself so the
        // user doesn't fall back to the document body.
        e.preventDefault()
        root.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    root.addEventListener('keydown', handleKeyDown)
    return () => {
      root.removeEventListener('keydown', handleKeyDown)
      // Restore focus to wherever it was — important for screen reader
      // users so they don't lose their place after closing the dialog.
      previouslyFocused?.focus?.()
    }
  }, [ref, active])
}

import { useCallback, useMemo } from 'react'
import { FileText, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { resolveWikiTarget } from '../../store/knowledgeStore'
import { useToastStore } from '../../store/toastStore'

interface WikiLinkProps {
  /** The note title the link points at. */
  target?: string
  /** Optional `#heading` fragment (currently used for the tooltip only). */
  heading?: string
  /** What to show — the alias if one was given, otherwise the target. */
  label?: string
  children?: React.ReactNode
}

/**
 * A rendered `[[wiki link]]`.
 *
 * ★ An unresolved link is a first-class state, not an error. In a knowledge
 * base you write `[[Kalman Filter]]` the moment you think of it and fill the
 * note in later, so the affordance for "this note does not exist" has to be
 * *create it*, not a red squiggle. That is the whole difference between a
 * broken link and a writing prompt.
 */
export function WikiLink({ target, heading, label, children }: WikiLinkProps) {
  const { t } = useTranslation()
  const openPage = useWorkspaceStore((s) => s.openPage)
  const createPage = useWorkspaceStore((s) => s.createPage)
  // Subscribing to the tree (not just reading it once) is what makes a link
  // resolve itself the moment its target note is created in another tab.
  const pageTree = useWorkspaceStore((s) => s.pageTree)

  const name = (target ?? label ?? '').trim()
  const resolved = useMemo(() => (name ? resolveWikiTarget(name, pageTree) : null), [name, pageTree])

  const onClick = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!name) return

      if (resolved) {
        await openPage(resolved.pageId)
        return
      }
      const created = await createPage(name, null)
      if (created) {
        useToastStore.getState().show('success', t('knowledge.createdFromLink', { title: name }))
      }
    },
    [name, resolved, openPage, createPage, t],
  )

  if (!name) return <>{children}</>

  const title = resolved
    ? t('knowledge.openNote', { title: resolved.title }) + (heading ? ` #${heading}` : '')
    : t('knowledge.createNote', { title: name })

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-wiki-link={resolved ? 'resolved' : 'unresolved'}
      className="inline-flex items-baseline gap-0.5 align-baseline rounded px-0.5 -mx-0.5 transition-colors hover:bg-[var(--accent-color)]/10"
      style={{
        color: resolved ? 'var(--accent-color)' : 'var(--text-muted)',
        // An unresolved link reads as "not written yet" rather than "wrong".
        textDecoration: resolved ? 'none' : 'underline dotted',
        textUnderlineOffset: '2px',
        font: 'inherit',
      }}
    >
      {resolved ? (
        <FileText size={12} className="translate-y-[1px] flex-shrink-0 opacity-70" aria-hidden />
      ) : (
        <Plus size={12} className="translate-y-[1px] flex-shrink-0 opacity-70" aria-hidden />
      )}
      <span>{children ?? label ?? name}</span>
    </button>
  )
}

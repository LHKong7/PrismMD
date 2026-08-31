import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight,
  CornerDownLeft,
  FileText,
  Hash,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { bindKnowledgeListeners, useKnowledgeStore } from '../../store/knowledgeStore'
import type { TFunction } from 'i18next'
import type { KnowledgeRelatedNote } from '../../types/electron'

/**
 * The note's place in the knowledge base: what points here, what it points
 * at, and what else is about the same thing.
 *
 * ★ This panel is the reason the app is a knowledge base rather than an
 * editor. An editor answers "what does this note say"; only the surrounding
 * graph answers "what did I already think about this", which is the question
 * you actually have when you open an old note.
 */
export function KnowledgePanel() {
  const { t } = useTranslation()
  const currentPageId = useWorkspaceStore((s) => s.currentPageId)
  const openPage = useWorkspaceStore((s) => s.openPage)
  const createPage = useWorkspaceStore((s) => s.createPage)

  const context = useKnowledgeStore((s) => s.context)
  const loading = useKnowledgeStore((s) => s.contextLoading)
  const stats = useKnowledgeStore((s) => s.stats)
  const reindexing = useKnowledgeStore((s) => s.reindexing)
  const loadContext = useKnowledgeStore((s) => s.loadContext)
  const loadStats = useKnowledgeStore((s) => s.loadStats)
  const reindex = useKnowledgeStore((s) => s.reindex)

  useEffect(() => {
    bindKnowledgeListeners()
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    void loadContext(currentPageId)
  }, [currentPageId, loadContext])

  if (!currentPageId) {
    return <Empty message={t('knowledge.noNoteOpen')} />
  }

  if (loading && !context) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  const backlinks = context?.backlinks ?? []
  const outgoing = context?.outgoing ?? []
  const related = context?.related ?? []
  const tags = context?.tags ?? []
  const unresolvedOutgoing = outgoing.filter((l) => !l.resolved)
  const resolvedOutgoing = outgoing.filter((l) => l.resolved)

  const isEmpty =
    backlinks.length === 0 && outgoing.length === 0 && related.length === 0 && tags.length === 0

  return (
    <div className="h-full overflow-y-auto text-xs">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-3">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
              style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
            >
              <Hash size={10} aria-hidden />
              {tag}
            </span>
          ))}
        </div>
      )}

      <Section
        icon={CornerDownLeft}
        title={t('knowledge.backlinks')}
        count={backlinks.length}
        hint={t('knowledge.backlinksHint')}
      >
        {backlinks.map((link) => (
          <NoteRow
            key={link.pageId}
            title={link.title}
            detail={link.context}
            badge={link.occurrences > 1 ? `${link.occurrences}` : undefined}
            onClick={() => void openPage(link.pageId)}
          />
        ))}
      </Section>

      <Section icon={ArrowUpRight} title={t('knowledge.outgoing')} count={outgoing.length}>
        {resolvedOutgoing.map((link) => (
          <NoteRow
            key={`out-${link.pageId}`}
            title={link.title}
            detail={link.heading ? `#${link.heading}` : undefined}
            onClick={() => void openPage(link.pageId)}
          />
        ))}
        {unresolvedOutgoing.map((link) => (
          <NoteRow
            key={`missing-${link.target}`}
            title={link.target}
            // Not an error state: an unwritten note is a prompt to write it.
            detail={t('knowledge.notWrittenYet')}
            muted
            icon={Plus}
            onClick={() => void createPage(link.target, null)}
          />
        ))}
      </Section>

      <Section
        icon={Sparkles}
        title={t('knowledge.related')}
        count={related.length}
        hint={t('knowledge.relatedHint')}
      >
        {related.map((note) => (
          <NoteRow
            key={note.pageId}
            title={note.title}
            detail={reasonLabel(note, t)}
            onClick={() => void openPage(note.pageId)}
          />
        ))}
      </Section>

      {isEmpty && !loading && (
        <p className="px-3 pb-3 pt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {t('knowledge.emptyNote')}
        </p>
      )}

      <div
        className="mt-2 flex items-center justify-between gap-2 border-t px-3 py-2"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
      >
        <span className="truncate">
          {stats
            ? t('knowledge.indexSummary', {
                notes: stats.notes,
                links: stats.resolvedLinks,
                unresolved: stats.unresolvedLinks,
              })
            : ''}
        </span>
        <button
          type="button"
          onClick={() => void reindex()}
          disabled={reindexing}
          title={t('knowledge.reindex')}
          className="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/10 disabled:opacity-50 dark:hover:bg-white/10"
        >
          <RefreshCw size={12} className={reindexing ? 'animate-spin' : undefined} />
        </button>
      </div>
    </div>
  )
}

/** `link`/`backlink`/`tag`/`text` -> a phrase that says why this note showed up. */
function reasonLabel(note: KnowledgeRelatedNote, t: TFunction): string {
  if (note.sharedTags.length > 0) return note.sharedTags.map((tag) => `#${tag}`).join(' ')
  const [first] = note.reasons
  switch (first) {
    case 'link':
      return t('knowledge.reasonLink')
    case 'backlink':
      return t('knowledge.reasonBacklink')
    case 'tag':
      return t('knowledge.reasonTag')
    default:
      return t('knowledge.reasonText')
  }
}

function Section({
  icon: Icon,
  title,
  count,
  hint,
  children,
}: {
  icon: LucideIcon
  title: string
  count: number
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="px-1 pt-3">
      <h3
        className="flex items-center gap-1 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <Icon size={11} aria-hidden />
        {title}
        <span className="opacity-60">{count}</span>
      </h3>
      {count === 0 ? (
        hint ? (
          <p className="px-2 pb-1 leading-relaxed" style={{ color: 'var(--text-muted)', opacity: 0.75 }}>
            {hint}
          </p>
        ) : null
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  )
}

function NoteRow({
  title,
  detail,
  badge,
  muted,
  icon: Icon = FileText,
  onClick,
}: {
  title: string
  detail?: string
  badge?: string
  muted?: boolean
  icon?: LucideIcon
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-1.5 rounded px-2 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
      >
        <Icon
          size={12}
          className="mt-[2px] flex-shrink-0 opacity-60"
          style={{ color: muted ? 'var(--text-muted)' : 'var(--accent-color)' }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate"
            style={{ color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}
          >
            {title}
          </span>
          {detail && (
            <span
              className="mt-0.5 block leading-snug line-clamp-2"
              style={{ color: 'var(--text-muted)', opacity: 0.8 }}
            >
              {detail}
            </span>
          )}
        </span>
        {badge && (
          <span
            className="mt-[1px] flex-shrink-0 rounded px-1 text-[10px]"
            style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}
          >
            {badge}
          </span>
        )}
      </button>
    </li>
  )
}

function Empty({ message }: { message: string }) {
  return (
    <p className="px-3 py-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
      {message}
    </p>
  )
}

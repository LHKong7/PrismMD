import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Info, Quote, Share2, Clock, AlertTriangle } from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'

/**
 * Wikipedia-style card for the currently focused entity. Consumes the
 * insightGraph store's cached queries so tab-switching is instant after
 * the first fetch.
 *
 * Layout: header (name + type) → profile summary → claims list →
 * connected entities → timeline. Each section handles its own loading
 * state and degrades gracefully when the SDK returns an empty array.
 */
export function EntityPanel() {
  const { t } = useTranslation()
  const focused = useUIStore((s) => s.focusedEntityName)
  const focusEntity = useUIStore((s) => s.focusEntity)

  const getEntityProfile = useInsightGraphStore((s) => s.getEntityProfile)
  const getClaimsAbout = useInsightGraphStore((s) => s.getClaimsAbout)
  const getEntityRelationships = useInsightGraphStore((s) => s.getEntityRelationships)
  const getEntityTimeline = useInsightGraphStore((s) => s.getEntityTimeline)
  const getContradictions = useInsightGraphStore((s) => s.getContradictions)
  const entityProfileCache = useInsightGraphStore((s) => s.entityProfileCache)
  const claimsCache = useInsightGraphStore((s) => s.claimsCache)
  const relationshipsCache = useInsightGraphStore((s) => s.entityRelationshipsCache)
  const timelineCache = useInsightGraphStore((s) => s.timelineCache)
  const contradictionsCache = useInsightGraphStore((s) => s.contradictionsCache)

  const [loading, setLoading] = useState(false)

  // Kick off all five lookups in parallel — each one is independently
  // cached by the store so re-focusing an entity is a no-op.
  useEffect(() => {
    if (!focused) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      getEntityProfile(focused),
      getClaimsAbout(focused),
      getEntityRelationships(focused),
      getEntityTimeline(focused),
      getContradictions(focused),
    ])
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focused, getEntityProfile, getClaimsAbout, getEntityRelationships, getEntityTimeline, getContradictions])

  if (!focused) {
    return (
      <div className="p-6 text-center">
        <Info size={20} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('entityPanel.empty')}
        </p>
      </div>
    )
  }

  const profile = entityProfileCache[focused]
  const claims = claimsCache[focused] ?? []
  const rels = relationshipsCache[focused] ?? []
  const timeline = timelineCache[focused] ?? []
  const contradictions = contradictionsCache[focused] ?? []

  const profileType =
    (profile?.type as string | undefined) ??
    (profile?.entityType as string | undefined)
  const profileSummary =
    (profile?.summary as string | undefined) ??
    (profile?.description as string | undefined) ??
    ''

  return (
    <div className="p-3 overflow-y-auto h-full">
      {/* Header */}
      <div className="mb-3">
        <h2
          className="text-base font-semibold leading-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          {focused}
        </h2>
        {profileType && (
          <span
            className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
          >
            {profileType}
          </span>
        )}
      </div>

      {loading && !profile && (
        <div className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={12} className="animate-spin" />
          <span>{t('entityPanel.loading')}</span>
        </div>
      )}

      {/* Summary */}
      {profileSummary && (
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: 'var(--text-secondary)' }}
        >
          {profileSummary}
        </p>
      )}

      {/* Contradictions (surfaced first because they're high-signal) */}
      {contradictions.length > 0 && (
        <Section icon={<AlertTriangle size={12} className="text-amber-500" />} title={t('entityPanel.contradictions')}>
          {contradictions.slice(0, 6).map((c, idx) => (
            <ListItem key={`c-${idx}`}>
              {String(c.description ?? c.summary ?? JSON.stringify(c))}
            </ListItem>
          ))}
        </Section>
      )}

      {/* Claims */}
      {claims.length > 0 && (
        <Section icon={<Quote size={12} />} title={t('entityPanel.claims')}>
          {claims.slice(0, 10).map((c, idx) => (
            <ListItem key={`cl-${idx}`}>
              {String(c.text ?? c.claim ?? c.statement ?? JSON.stringify(c))}
            </ListItem>
          ))}
        </Section>
      )}

      {/* Relationships */}
      {rels.length > 0 && (
        <Section icon={<Share2 size={12} />} title={t('entityPanel.related')}>
          {rels.slice(0, 12).map((r, idx) => {
            const target =
              (r.relatedEntityName as string | undefined) ??
              (r.peer as string | undefined) ??
              (r.target as string | undefined) ??
              ''
            const relType =
              (r.relationshipType as string | undefined) ??
              (r.type as string | undefined)
            return (
              <button
                key={`r-${idx}`}
                onClick={() => target && focusEntity(target)}
                className="w-full text-left text-xs px-1.5 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span style={{ color: 'var(--accent-color)' }}>{target || '—'}</span>
                {relType && (
                  <span className="ml-2 text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
                    {relType}
                  </span>
                )}
              </button>
            )
          })}
        </Section>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <Section icon={<Clock size={12} />} title={t('entityPanel.timeline')}>
          {timeline.slice(0, 8).map((item, idx) => (
            <ListItem key={`t-${idx}`}>
              <span className="text-[10px] mr-2" style={{ color: 'var(--text-muted)' }}>
                {String(item.date ?? item.timestamp ?? '')}
              </span>
              {String(item.description ?? item.event ?? JSON.stringify(item))}
            </ListItem>
          ))}
        </Section>
      )}

      {/* Empty all-round */}
      {!loading &&
        !profileSummary &&
        claims.length === 0 &&
        rels.length === 0 &&
        timeline.length === 0 &&
        contradictions.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('entityPanel.noData')}
          </p>
        )}
    </div>
  )
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4">
      <div
        className="flex items-center gap-1.5 mb-1 text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-xs leading-relaxed px-1.5 py-1 rounded"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </div>
  )
}

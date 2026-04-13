import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, RefreshCw, X, ChevronRight, Loader2, Network } from 'lucide-react'
import { useFileStore } from '../../store/fileStore'
import { useAgentStore } from '../../store/agentStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useInsightGraphStore } from '../../store/insightGraphStore'
import { useUIStore } from '../../store/uiStore'

interface CachedSummary {
  tldr: string
  questions: string[]
  generatedAt: number
  signature: string
}

/**
 * Cheap non-crypto signature mirroring the main-process helper in
 * docSummaryService. Lets the renderer decide whether a cache hit is
 * stale without a round-trip.
 */
function signatureForContent(content: string): string {
  const len = content.length
  const head = content.slice(0, 64).replace(/\s+/g, ' ')
  const tail = content.slice(-64).replace(/\s+/g, ' ')
  return `${len}:${head}…${tail}`
}

/**
 * TL;DR card pinned at the top of the reader. On document load we look
 * for a cached summary; on miss (or stale signature) we call
 * `sendAgentOneShot` with a JSON schema and persist the result.
 *
 * The user can:
 *  - click a suggested question → opens the agent sidebar with that
 *    question already sent
 *  - regenerate (force refresh)
 *  - dismiss the card for the current session
 */
export function DocSummary() {
  const { t } = useTranslation()
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const currentContent = useFileStore((s) => s.currentContent)
  const activeProvider = useSettingsStore((s) => s.activeProvider)
  const neo4jUri = useSettingsStore((s) => s.insightGraph.neo4j.uri)
  const toggleAgentSidebar = useAgentStore((s) => s.setAgentSidebarOpen)
  const sendMessage = useAgentStore((s) => s.sendMessage)
  const ingestStatus = useInsightGraphStore((s) => s.ingest)
  const ingestFile = useInsightGraphStore((s) => s.ingestFile)
  const setGraphScope = useUIStore((s) => s.setGraphScope)
  const setMainViewMode = useUIStore((s) => s.setMainViewMode)

  const graphGateOpen = Boolean(activeProvider) && Boolean(neo4jUri?.trim())
  const ingestIsForCurrent = ingestStatus.filePath === currentFilePath
  const ingestStage = ingestIsForCurrent ? ingestStatus.stage : 'idle'
  const ingestInFlight =
    ingestStage === 'parsing' ||
    ingestStage === 'extracting' ||
    ingestStage === 'resolving' ||
    ingestStage === 'writing'

  const [summary, setSummary] = useState<CachedSummary | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  // Guard against stale responses if the user switches files mid-request.
  const lastRequestedFile = useRef<string | null>(null)

  /**
   * Look up a cached summary for the current file without ever calling the
   * LLM. Used on file open so we don't auto-generate uninvited.
   */
  const loadFromCache = async () => {
    if (!currentFilePath || !currentContent) return
    const fileAtRequest = currentFilePath
    const signature = signatureForContent(currentContent)
    lastRequestedFile.current = fileAtRequest
    try {
      const cached = await window.electronAPI.docSummaryGet(fileAtRequest)
      if (cached && cached.signature === signature) {
        if (lastRequestedFile.current === fileAtRequest) setSummary(cached)
      }
    } catch {
      // Cache read failed — stay silent; the user can manually regenerate.
    }
  }

  /**
   * Generate a fresh summary via the LLM. Only triggered by explicit user
   * action (the Regenerate button) — never automatically on file open.
   */
  const generate = async () => {
    if (!currentFilePath || !currentContent) return
    const fileAtRequest = currentFilePath
    const signature = signatureForContent(currentContent)
    lastRequestedFile.current = fileAtRequest

    if (!activeProvider) {
      // No provider configured — don't annoy the user with an error; just
      // stay silent and let them open Settings from elsewhere.
      return
    }

    setStatus('loading')
    setError(null)

    try {
      // Trim the document before sending so we stay well inside a typical
      // 8k-token context window. The TL;DR is cheap; a slightly truncated
      // input is fine.
      const MAX_CHARS = 12000
      const body =
        currentContent.length > MAX_CHARS
          ? currentContent.slice(0, MAX_CHARS) + '\n\n…(truncated)'
          : currentContent

      const res = await window.electronAPI.sendAgentOneShot({
        prompt: `Document content:\n\n"""\n${body}\n"""\n\nReturn a JSON object with:\n- "tldr": a 2–3 sentence summary of what the document is about\n- "questions": an array of EXACTLY 3 short, specific questions a curious reader would ask after reading it`,
        systemPrompt:
          'You are a reading assistant that writes concise, grounded overviews. Do not speculate beyond the provided text. Never invent facts.',
        jsonSchema: {
          tldr: 'string',
          questions: ['string', 'string', 'string'],
        },
      })

      if (lastRequestedFile.current !== fileAtRequest) return

      if (!res.ok) {
        setError(res.error)
        setStatus('error')
        return
      }
      const parsed = res.result.json as { tldr?: string; questions?: string[] } | undefined
      if (!parsed?.tldr || !Array.isArray(parsed.questions)) {
        setError(t('docSummary.parseError'))
        setStatus('error')
        return
      }
      const saved: CachedSummary = {
        tldr: parsed.tldr,
        questions: parsed.questions.slice(0, 3),
        generatedAt: Date.now(),
        signature,
      }
      setSummary(saved)
      setStatus('idle')
      window.electronAPI.docSummarySet(fileAtRequest, saved).catch(() => {})
    } catch (err) {
      if (lastRequestedFile.current !== fileAtRequest) return
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  // On file change, only hydrate from cache — never auto-generate. The
  // user explicitly opts in by clicking Regenerate.
  useEffect(() => {
    setSummary(null)
    setStatus('idle')
    setError(null)
    if (!currentFilePath || !currentContent) return
    loadFromCache().catch(() => {})
    // We deliberately only depend on the file path, not the content — we
    // don't want every keystroke (if files become editable) to retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilePath])

  if (!currentFilePath) return null
  if (dismissedFor === currentFilePath) return null

  const [graphStatusDismissed, setGraphStatusDismissed] = useState(false)

  // Reset the transient graph status dismissal when a new ingest starts
  // for this file, or when the file changes.
  useEffect(() => {
    setGraphStatusDismissed(false)
  }, [currentFilePath, ingestStage])

  // Auto-hide completed / failed status after 8s so the card doesn't
  // stay cluttered indefinitely.
  useEffect(() => {
    if (!ingestIsForCurrent) return
    if (ingestStage !== 'completed' && ingestStage !== 'failed') return
    const id = setTimeout(() => setGraphStatusDismissed(true), 8000)
    return () => clearTimeout(id)
  }, [ingestIsForCurrent, ingestStage])

  const handleBuildGraph = () => {
    if (!currentFilePath || !graphGateOpen || ingestInFlight) return
    ingestFile(currentFilePath).catch(() => {})
  }

  const handleViewGraph = () => {
    setGraphScope('document')
    setMainViewMode('graph')
  }

  const handleAsk = (question: string) => {
    toggleAgentSidebar(true)
    sendMessage(question, currentContent ?? undefined, currentFilePath ?? undefined)
  }

  const isEmpty = !summary && status !== 'loading' && status !== 'error'
  // If there's no cache and no active AI provider, stay fully hidden — the
  // user has nothing they can do with this card.
  if (isEmpty && !activeProvider) return null

  return (
    <div
      className="mx-auto my-4 max-w-[48rem] rounded-lg border"
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b text-xs font-semibold uppercase tracking-wider"
        style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} style={{ color: 'var(--accent-color)' }} />
          <span>{t('docSummary.title')}</span>
        </div>
        <div className="flex items-center gap-1">
          {graphGateOpen && (
            <button
              onClick={handleBuildGraph}
              disabled={ingestInFlight}
              className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
              title={t('docSummary.buildGraph')}
            >
              <Network size={12} className={ingestInFlight ? 'animate-pulse' : undefined} />
            </button>
          )}
          <button
            onClick={() => generate().catch(() => {})}
            disabled={status === 'loading'}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
            title={summary ? t('docSummary.regenerate') : t('docSummary.generate')}
          >
            <RefreshCw size={12} className={status === 'loading' ? 'animate-spin' : undefined} />
          </button>
          <button
            onClick={() => setDismissedFor(currentFilePath)}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
            title={t('docSummary.dismiss')}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        {ingestIsForCurrent && !graphStatusDismissed && (
          <>
            {ingestInFlight && (
              <div
                className="flex items-center gap-2 pb-2 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <Loader2 size={12} className="animate-spin" />
                <span>
                  {t(`statusBar.ingest.${ingestStage}`, t('docSummary.graphBuilding'))}
                </span>
              </div>
            )}
            {ingestStage === 'completed' && (
              <div
                className="flex items-center justify-between gap-2 pb-2 text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                <div className="flex items-center gap-1.5">
                  <Network size={12} style={{ color: 'var(--accent-color)' }} />
                  <span>{t('docSummary.graphBuildDone')}</span>
                </div>
                <button
                  onClick={handleViewGraph}
                  className="px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: 'var(--accent-color)' }}
                >
                  {t('docSummary.graphBuildView')}
                </button>
              </div>
            )}
            {ingestStage === 'failed' && (
              <div className="text-xs text-red-500 pb-2">
                {t('docSummary.graphBuildFailed')}
                {ingestStatus.error ? `: ${ingestStatus.error}` : ''}
              </div>
            )}
          </>
        )}
        {isEmpty && (
          <button
            onClick={() => generate().catch(() => {})}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Sparkles size={13} style={{ color: 'var(--accent-color)' }} />
            <span>{t('docSummary.generate')}</span>
          </button>
        )}
        {status === 'loading' && !summary && (
          <div className="flex items-center gap-2 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={14} className="animate-spin" />
            <span>{t('docSummary.loading')}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="text-xs text-red-500">
            {t('docSummary.error')}: {error ?? '—'}
          </div>
        )}
        {summary && (
          <>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'var(--text-primary)' }}
            >
              {summary.tldr}
            </p>
            {summary.questions.length > 0 && (
              <div className="mt-3 space-y-1">
                {summary.questions.map((q, idx) => (
                  <button
                    key={`${idx}-${q}`}
                    onClick={() => handleAsk(q)}
                    className="w-full flex items-start gap-1.5 text-left text-sm px-2 py-1.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <ChevronRight
                      size={13}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: 'var(--accent-color)' }}
                    />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

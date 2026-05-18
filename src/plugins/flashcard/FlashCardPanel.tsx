import { useState, useCallback, useEffect } from 'react'
import { Layers, RefreshCw, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '../../store/fileStore'
import { useFlashcards } from './useFlashcards'
import type { FlashCard } from './types'

export function FlashCardPanel() {
  const { t } = useTranslation()
  const currentFilePath = useFileStore((s) => s.currentFilePath)
  const currentContent = useFileStore((s) => s.currentContent)

  const { deck, generating, error, generateCards, updateCardStatus, getReviewQueue, stats } =
    useFlashcards(currentFilePath)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const queue = getReviewQueue()
  const currentCard: FlashCard | null = queue[currentIndex] ?? null

  // Reset position when deck changes
  useEffect(() => {
    setCurrentIndex(0)
    setFlipped(false)
  }, [deck?.generatedAt])

  const handleGenerate = useCallback(() => {
    if (currentContent) {
      void generateCards(currentContent)
    }
  }, [generateCards, currentContent])

  const handleFlip = useCallback(() => setFlipped((f) => !f), [])

  const handleKnow = useCallback(() => {
    if (!currentCard) return
    const newStatus = currentCard.status === 'new' ? 'learning' : 'mastered'
    updateCardStatus(currentCard.id, newStatus)
    setFlipped(false)
    if (currentIndex < queue.length - 1) setCurrentIndex((i) => i + 1)
  }, [currentCard, currentIndex, queue.length, updateCardStatus])

  const handleDontKnow = useCallback(() => {
    if (!currentCard) return
    updateCardStatus(currentCard.id, currentCard.status === 'mastered' ? 'learning' : 'new')
    setFlipped(false)
    if (currentIndex < queue.length - 1) setCurrentIndex((i) => i + 1)
  }, [currentCard, currentIndex, queue.length, updateCardStatus])

  const prev = () => { setCurrentIndex((i) => Math.max(0, i - 1)); setFlipped(false) }
  const next = () => { setCurrentIndex((i) => Math.min(queue.length - 1, i + 1)); setFlipped(false) }

  // Keyboard shortcuts when panel is focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleFlip() }
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // No file open
  if (!currentFilePath) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          {t('flashcard.noFile')}
        </p>
      </div>
    )
  }

  // Generating state
  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent-color)' }} />
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('flashcard.generating')}</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <AlertCircle size={20} style={{ color: 'var(--color-error)' }} />
        <p className="text-xs text-center" style={{ color: 'var(--color-error)' }}>{error}</p>
        <button
          onClick={handleGenerate}
          className="text-xs px-3 py-1 rounded transition-colors"
          style={{ color: 'var(--accent-color)' }}
        >
          {t('flashcard.retry')}
        </button>
      </div>
    )
  }

  // Empty state — no cards yet
  if (!deck || deck.cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
        <Layers size={28} style={{ color: 'var(--text-muted)' }} />
        <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
          {t('flashcard.empty')}
        </p>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--accent-color)', color: '#fff' }}
        >
          <Layers size={13} />
          {t('flashcard.generate')}
        </button>
      </div>
    )
  }

  // Review mode
  const progressPercent = stats ? Math.round((stats.mastered / stats.total) * 100) : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-color)' }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {currentIndex + 1}/{queue.length}
          </span>
          {stats && (
            <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--color-success)' }}>{stats.mastered}</span>/
              <span style={{ color: 'var(--color-warning)' }}>{stats.learning}</span>/
              <span>{stats.new}</span>
            </div>
          )}
        </div>
        <button
          onClick={handleGenerate}
          className="p-1 rounded transition-colors hover:bg-black/10 dark:hover:bg-white/10"
          title={t('flashcard.regenerate')}
        >
          <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progressPercent}%`, backgroundColor: 'var(--color-success)' }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col p-3">
        {currentCard && (
          <>
            <button
              onClick={handleFlip}
              className="flex-1 rounded-lg border p-4 text-left cursor-pointer transition-all hover:shadow-md"
              style={{
                borderColor: flipped ? 'var(--color-success)' : 'var(--accent-color)',
                backgroundColor: 'var(--bg-primary)',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                style={{ color: flipped ? 'var(--color-success)' : 'var(--accent-color)' }}
              >
                {flipped ? t('flashcard.answer') : t('flashcard.question')}
              </div>
              <div
                className="text-sm whitespace-pre-wrap"
                style={{ color: 'var(--text-primary)' }}
              >
                {flipped ? currentCard.answer : currentCard.question}
              </div>
              {!flipped && (
                <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>
                  {t('flashcard.clickToFlip')}
                </p>
              )}
            </button>

            {/* Actions */}
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={prev}
                disabled={currentIndex === 0}
                className="p-1.5 rounded transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-muted)' }}
              >
                <ChevronLeft size={16} />
              </button>

              {flipped && (
                <div className="flex gap-2">
                  <button
                    onClick={handleDontKnow}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-error-bg)',
                      color: 'var(--color-error)',
                      border: '1px solid var(--color-error-border)',
                    }}
                  >
                    {t('flashcard.dontKnow')}
                  </button>
                  <button
                    onClick={handleKnow}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: 'var(--color-success-bg)',
                      color: 'var(--color-success)',
                      border: '1px solid var(--color-success-border)',
                    }}
                  >
                    {t('flashcard.know')}
                  </button>
                </div>
              )}

              <button
                onClick={next}
                disabled={currentIndex >= queue.length - 1}
                className="p-1.5 rounded transition-colors disabled:opacity-30"
                style={{ color: 'var(--text-muted)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

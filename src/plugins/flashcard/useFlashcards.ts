import { useState, useEffect, useCallback } from 'react'
import type { FlashCard, FlashCardDeck, CardStatus } from './types'

const STORAGE_PREFIX = 'flashcards:'

function storageKey(filePath: string): string {
  return `${STORAGE_PREFIX}${filePath}`
}

function loadDeck(filePath: string): FlashCardDeck | null {
  try {
    const raw = localStorage.getItem(storageKey(filePath))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDeck(deck: FlashCardDeck): void {
  localStorage.setItem(storageKey(deck.filePath), JSON.stringify(deck))
}

const SYSTEM_PROMPT = `You are a study assistant. Extract 5–10 key concepts from the given document as flashcards for spaced repetition.

Rules:
- Questions should test understanding, not just recall.
- Answers should be concise (1–3 sentences).
- Cover the most important concepts, definitions, and relationships.
- Vary question types: "What is...", "How does...", "Why...", "Compare...", etc.

Return JSON: { "cards": [{ "question": "...", "answer": "..." }] }`

const JSON_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
        required: ['question', 'answer'],
      },
    },
  },
  required: ['cards'],
}

export function useFlashcards(filePath: string | null) {
  const [deck, setDeck] = useState<FlashCardDeck | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load deck when filePath changes
  useEffect(() => {
    if (!filePath) {
      setDeck(null)
      return
    }
    const loaded = loadDeck(filePath)
    setDeck(loaded)
  }, [filePath])

  const generateCards = useCallback(async (content: string) => {
    if (!filePath || !content.trim()) return
    setGenerating(true)
    setError(null)

    try {
      const res = await window.electronAPI.sendAgentOneShot({
        systemPrompt: SYSTEM_PROMPT,
        prompt: `Document content:\n\n${content.slice(0, 8000)}`,
        jsonSchema: JSON_SCHEMA,
      })

      if (!res.ok) {
        setError(res.error)
        setGenerating(false)
        return
      }

      const parsed = (res.result.json ?? JSON.parse(res.result.reply)) as { cards: { question: string; answer: string }[] }

      const newDeck: FlashCardDeck = {
        filePath,
        generatedAt: Date.now(),
        cards: parsed.cards.map((c) => ({
          id: crypto.randomUUID(),
          question: c.question,
          answer: c.answer,
          status: 'new' as CardStatus,
          lastReviewed: null,
        })),
      }

      saveDeck(newDeck)
      setDeck(newDeck)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
    }
  }, [filePath])

  const updateCardStatus = useCallback((cardId: string, status: CardStatus) => {
    if (!deck) return
    const updated: FlashCardDeck = {
      ...deck,
      cards: deck.cards.map((c) =>
        c.id === cardId ? { ...c, status, lastReviewed: Date.now() } : c,
      ),
    }
    saveDeck(updated)
    setDeck(updated)
  }, [deck])

  const getReviewQueue = useCallback((): FlashCard[] => {
    if (!deck) return []
    // new first, then learning, then mastered
    const order: Record<CardStatus, number> = { new: 0, learning: 1, mastered: 2 }
    return [...deck.cards].sort((a, b) => order[a.status] - order[b.status])
  }, [deck])

  const stats = deck
    ? {
        total: deck.cards.length,
        new: deck.cards.filter((c) => c.status === 'new').length,
        learning: deck.cards.filter((c) => c.status === 'learning').length,
        mastered: deck.cards.filter((c) => c.status === 'mastered').length,
      }
    : null

  return { deck, generating, error, generateCards, updateCardStatus, getReviewQueue, stats }
}

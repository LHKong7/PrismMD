export type CardStatus = 'new' | 'learning' | 'mastered'

export interface FlashCard {
  id: string
  question: string
  answer: string
  status: CardStatus
  lastReviewed: number | null
}

export interface FlashCardDeck {
  filePath: string
  cards: FlashCard[]
  generatedAt: number
}

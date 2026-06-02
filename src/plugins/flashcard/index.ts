import { Layers } from 'lucide-react'
import { FlashCardPanel } from './FlashCardPanel'
import type { Plugin } from '../../lib/plugins/types'

/**
 * FlashCard plugin — generate Q&A flashcards from document content
 * for spaced repetition learning.
 *
 * - Registers a sidebar panel for card review
 * - Registers a command to generate flashcards from the current document
 */
const flashcardPlugin: Plugin = {
  id: 'prismmd.flashcard',
  name: 'FlashCards',
  version: '0.1.0',
  description: 'Generate Q&A flashcards from documents for spaced repetition.',

  activate(host) {
    // Sidebar panel for reviewing flashcards
    host.registerSidebarPanel({
      id: 'flashcard',
      title: 'FlashCards',
      icon: Layers,
      component: FlashCardPanel,
    })

    // Command palette action
    host.registerCommand({
      id: 'prismmd.flashcard.generate',
      title: 'Generate Flashcards',
      group: 'FlashCards',
      icon: Layers,
      handler: async () => {
        const { useWorkspaceStore } = await import('../../store/workspaceStore')
        const { useUIStore } = await import('../../store/uiStore')
        const content = useWorkspaceStore.getState().currentContent
        if (!content) {
          host.notify('No document open', 'error')
          return
        }
        // Open the flashcard panel — generation happens there
        useUIStore.getState().setRightSidebarTab('flashcard')
        useUIStore.getState().setRightSidebarOpen(true)
      },
    })
  },
}

export default flashcardPlugin

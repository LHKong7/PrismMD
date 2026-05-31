import { create } from 'zustand'

export interface SavedPrompt {
  id: string
  name: string
  content: string
  category: 'general' | 'writing' | 'analysis' | 'coding' | 'custom'
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'prismmd-prompt-library'

function loadPrompts(): SavedPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePrompts(prompts: SavedPrompt[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
  } catch {
    // localStorage quota exceeded — silently fail rather than crash
    console.warn('[PromptLibrary] Failed to save prompts (storage quota may be exceeded)')
  }
}

interface PromptLibraryStore {
  prompts: SavedPrompt[]

  /** Add a new prompt to the library. Returns the new prompt's ID. */
  addPrompt: (name: string, content: string, category?: SavedPrompt['category']) => string
  /** Update an existing prompt. */
  updatePrompt: (id: string, updates: Partial<Pick<SavedPrompt, 'name' | 'content' | 'category'>>) => void
  /** Delete a prompt by ID. */
  deletePrompt: (id: string) => void
  /** Get a prompt by ID. */
  getPrompt: (id: string) => SavedPrompt | undefined
  /** Duplicate a prompt. */
  duplicatePrompt: (id: string) => string | null
}

export const usePromptLibraryStore = create<PromptLibraryStore>((set, get) => ({
  prompts: loadPrompts(),

  addPrompt: (name, content, category = 'custom') => {
    const id = crypto.randomUUID()
    const now = Date.now()
    const prompt: SavedPrompt = { id, name, content, category, createdAt: now, updatedAt: now }
    const updated = [...get().prompts, prompt]
    savePrompts(updated)
    set({ prompts: updated })
    return id
  },

  updatePrompt: (id, updates) => {
    const updated = get().prompts.map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p,
    )
    savePrompts(updated)
    set({ prompts: updated })
  },

  deletePrompt: (id) => {
    const updated = get().prompts.filter((p) => p.id !== id)
    savePrompts(updated)
    set({ prompts: updated })
  },

  getPrompt: (id) => {
    return get().prompts.find((p) => p.id === id)
  },

  duplicatePrompt: (id) => {
    const source = get().prompts.find((p) => p.id === id)
    if (!source) return null
    return get().addPrompt(`${source.name} (copy)`, source.content, source.category)
  },
}))

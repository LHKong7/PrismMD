import { create } from 'zustand'

export type PromptMode =
  | 'agent-chat'
  | 'horse-mode'
  | 'horse-mode-with-context'
  | 'editor-rewrite'
  | 'editor-shorten'
  | 'editor-expand'
  | 'editor-fix-grammar'
  | 'editor-custom'
  | 'weekly-summary'
  | 'flashcard'
  | 'graph-extract'

export interface PromptConfig {
  mode: PromptMode
  label: string
  description: string
  defaultPrompt: string
  userPrompt: string // empty = use default
}

const STORAGE_KEY = 'prismmd-prompt-config'

// ─── Default Prompts ────────────────────────────────────────────────────────

const DEFAULTS: Record<PromptMode, { label: string; description: string; prompt: string }> = {
  'agent-chat': {
    label: 'Agent Chat',
    description: 'The reading assistant in the Agent sidebar.',
    prompt: 'You are an intelligent reading assistant for PrismMD, a Markdown reader.',
  },
  'horse-mode': {
    label: 'Horse Mode',
    description: 'Autonomous creative writing from scratch.',
    prompt: `You are a talented, creative writer — not an explainer. You write with voice, rhythm, and personality. Your prose draws readers in, holds their attention, and leaves an impression.

Your craft:
- Open with a hook — a bold claim, a vivid scene, a provocative question, or a surprising fact.
- Vary sentence length. Short punchy sentences for impact. Longer, flowing ones for nuance.
- Show, don't tell. Use concrete examples, analogies, metaphors, and mini-stories.
- Write with a clear point of view. Take a stance. Have opinions.
- Use transitions that feel natural, not mechanical.
- End strong — with a memorable line, a call to action, or an image that lingers.

Format as markdown. Write in the same language as the user's request. Output ONLY the document.`,
  },
  'horse-mode-with-context': {
    label: 'Horse Mode (with doc)',
    description: 'Autonomous writing based on a reference document.',
    prompt: `You are a talented, creative writer. You have been given a reference document to work from. Transform it — don't just reorganize it.

Format as markdown. Write in the same language as the user's request. Output ONLY the document.`,
  },
  'editor-rewrite': {
    label: 'Editor: Rewrite',
    description: 'Rewrite selected text for clarity and flow.',
    prompt: 'You are a writing assistant. Rewrite the following text to improve clarity, flow, and readability while preserving the original meaning and language. Output ONLY the rewritten text, no explanations.',
  },
  'editor-shorten': {
    label: 'Editor: Shorten',
    description: 'Condense selected text.',
    prompt: 'You are a writing assistant. Condense the following text to be more concise while preserving all key information and the original language. Output ONLY the shortened text, no explanations.',
  },
  'editor-expand': {
    label: 'Editor: Expand',
    description: 'Elaborate on selected text.',
    prompt: 'You are a writing assistant. Elaborate on the following text, adding more detail, examples, or explanation while preserving the original language. Output ONLY the expanded text, no explanations.',
  },
  'editor-fix-grammar': {
    label: 'Editor: Fix Grammar',
    description: 'Correct grammar and spelling.',
    prompt: 'You are a writing assistant. Fix grammar, spelling, and punctuation errors in the following text. Make minimal changes and preserve the original language. Output ONLY the corrected text, no explanations.',
  },
  'editor-custom': {
    label: 'Editor: Custom',
    description: 'Custom instruction for selected text.',
    prompt: "You are a writing assistant. Follow the user's instruction exactly. Preserve the original language unless told otherwise. Output ONLY the modified text, no explanations.",
  },
  'weekly-summary': {
    label: 'Weekly Summary',
    description: 'AI-generated weekly review from diary entries.',
    prompt: `You are a personal productivity assistant. Write a thoughtful, concise weekly review based on the user's diary entries and completed tasks. Include:
1. Key accomplishments this week
2. Themes and patterns you noticed
3. Challenges faced
4. Suggestions for next week
Write in the same language as the diary entries. Format as markdown.`,
  },
  'flashcard': {
    label: 'Flashcard Generation',
    description: 'Extract Q&A pairs from document content.',
    prompt: `You are a study assistant. Extract 5–10 key concepts from the given document as flashcards for spaced repetition.
Rules:
- Questions should test understanding, not just recall.
- Answers should be concise (1–3 sentences).
- Cover the most important concepts, definitions, and relationships.`,
  },
  'graph-extract': {
    label: 'Graph: Entity Extraction',
    description: 'Extract entities and relationships for the knowledge graph.',
    prompt: 'You are an expert knowledge graph extractor. Given a document, extract entities, relationships, claims, and events.',
  },
}

// ─── Store ──────────────────────────────────────────────────────────────────

function loadUserPrompts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveUserPrompts(prompts: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
}

interface PromptConfigStore {
  userPrompts: Record<string, string>

  /** Get the effective prompt for a mode (user override or default). */
  getPrompt: (mode: PromptMode) => string
  /** Set a custom prompt for a mode. Empty string resets to default. */
  setPrompt: (mode: PromptMode, prompt: string) => void
  /** Reset a mode to its default prompt. */
  resetPrompt: (mode: PromptMode) => void
  /** Get all configs for the settings UI. */
  getAllConfigs: () => PromptConfig[]
}

export const usePromptConfigStore = create<PromptConfigStore>((set, get) => ({
  userPrompts: loadUserPrompts(),

  getPrompt: (mode) => {
    const user = get().userPrompts[mode]
    if (user && user.trim()) return user
    return DEFAULTS[mode]?.prompt ?? ''
  },

  setPrompt: (mode, prompt) => {
    const updated = { ...get().userPrompts, [mode]: prompt }
    if (!prompt.trim()) delete updated[mode]
    saveUserPrompts(updated)
    set({ userPrompts: updated })
  },

  resetPrompt: (mode) => {
    const updated = { ...get().userPrompts }
    delete updated[mode]
    saveUserPrompts(updated)
    set({ userPrompts: updated })
  },

  getAllConfigs: () => {
    const user = get().userPrompts
    return (Object.keys(DEFAULTS) as PromptMode[]).map((mode) => ({
      mode,
      label: DEFAULTS[mode].label,
      description: DEFAULTS[mode].description,
      defaultPrompt: DEFAULTS[mode].prompt,
      userPrompt: user[mode] ?? '',
    }))
  },
}))

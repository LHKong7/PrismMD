import { create } from 'zustand'

export interface Template {
  id: string
  name: string
  description: string
  content: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'prismmd-templates'

const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'builtin-meeting-notes',
    name: 'Meeting Notes',
    description: 'Structure for capturing meeting discussions and action items',
    content: `# Meeting Notes — {{date}}

## Attendees
-

## Agenda
1.

## Discussion


## Action Items
- [ ]
- [ ]

## Next Meeting
- Date:
- Topics:
`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-blog-post',
    name: 'Blog Post',
    description: 'Blog article skeleton with sections',
    content: `# Title

> **TL;DR** — One-sentence summary.

---

## Introduction


## Main Content

### Section 1


### Section 2


## Conclusion


---

*Published: {{date}}*
`,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-daily-journal',
    name: 'Daily Journal',
    description: 'Daily reflection and planning template',
    content: `# Journal — {{date}}

## Today's Highlights
-

## What I Learned


## Challenges


## Tomorrow's Plan
- [ ]
- [ ]

## Mood:
`,
    createdAt: 0,
    updatedAt: 0,
  },
]

function loadFromStorage(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* use defaults */ }
  return [...BUILTIN_TEMPLATES]
}

function saveToStorage(templates: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

interface TemplateStore {
  templates: Template[]
  loadTemplates: () => void
  addTemplate: (name: string, description: string, content: string) => void
  updateTemplate: (id: string, updates: Partial<Pick<Template, 'name' | 'description' | 'content'>>) => void
  deleteTemplate: (id: string) => void
  getTemplate: (id: string) => Template | undefined
}

export const useTemplateStore = create<TemplateStore>((set, get) => ({
  templates: loadFromStorage(),

  loadTemplates: () => {
    set({ templates: loadFromStorage() })
  },

  addTemplate: (name, description, content) => {
    const template: Template = {
      id: crypto.randomUUID(),
      name,
      description,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const updated = [...get().templates, template]
    saveToStorage(updated)
    set({ templates: updated })
  },

  updateTemplate: (id, updates) => {
    const updated = get().templates.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t,
    )
    saveToStorage(updated)
    set({ templates: updated })
  },

  deleteTemplate: (id) => {
    const updated = get().templates.filter((t) => t.id !== id)
    saveToStorage(updated)
    set({ templates: updated })
  },

  getTemplate: (id) => {
    return get().templates.find((t) => t.id === id)
  },
}))

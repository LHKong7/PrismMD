import { create } from 'zustand'
import { useAgentLogStore } from './agentLogStore'
import { usePromptConfigStore } from './promptConfigStore'

export type HorseModeStage = 'idle' | 'generating' | 'writing' | 'completed' | 'failed'

interface HorseModeStore {
  active: boolean
  task: string
  targetDir: string
  fileName: string
  stage: HorseModeStage
  error: string | null
  iterations: number
  currentIteration: number
  cancelled: boolean

  start: (task: string, targetDir: string, fileName: string, iterations?: number, documentContent?: string) => Promise<void>
  cancel: () => void
}

function hlog(message: string, level: 'info' | 'success' | 'error' = 'info') {
  useAgentLogStore.getState().log('horse-mode', message, level)
}

const REFINE_SYSTEM_PROMPT = `You are a talented editor and rewriter. You are given a draft document and the original task that produced it. Your job is to improve the draft — make it sharper, more engaging, better structured, and more polished.

Rules:
- Fix any weak openings, vague statements, or repetitive patterns.
- Improve flow, transitions, and rhythm.
- Strengthen the conclusion.
- Keep the same language, format (markdown), and overall structure unless improvement requires changes.
- Output ONLY the improved document — no meta-commentary, no "Here is the improved version", no diff markers.`

export const useHorseModeStore = create<HorseModeStore>((set, get) => ({
  active: false,
  task: '',
  targetDir: '',
  fileName: '',
  stage: 'idle',
  error: null,
  iterations: 1,
  currentIteration: 0,
  cancelled: false,

  start: async (task, targetDir, fileName, iterations = 1, documentContent) => {
    const hasDocContext = !!documentContent?.trim()
    set({
      active: true, task, targetDir, fileName, stage: 'generating',
      error: null, iterations, currentIteration: 1, cancelled: false,
    })

    useAgentLogStore.getState().panelOpen || useAgentLogStore.setState({ panelOpen: true })

    hlog(`Task: ${task.slice(0, 120)}${task.length > 120 ? '...' : ''}`)
    hlog(`Target: ${targetDir}/${fileName}`)
    hlog(`Iterations: ${iterations}`)
    if (hasDocContext) hlog('Using current document as reference')

    const filePath = `${targetDir}/${fileName}`

    try {
      // ── Iteration 1: Initial generation ──
      hlog(`Iteration 1/${iterations}: Generating initial draft...`)
      set({ currentIteration: 1 })

      const systemPrompt = hasDocContext
        ? usePromptConfigStore.getState().getPrompt('horse-mode-with-context')
        : usePromptConfigStore.getState().getPrompt('horse-mode')
      const prompt = hasDocContext
        ? `## Reference Document\n\n${documentContent!.slice(0, 12000)}\n\n---\n\n## Task\n\n${task}`
        : task

      const res = await window.electronAPI.sendAgentOneShot({ systemPrompt, prompt })

      if (!res.ok) {
        set({ stage: 'failed', error: res.error })
        hlog(`Failed: ${res.error}`, 'error')
        const { useToastStore } = await import('./toastStore')
        useToastStore.getState().show('error', `Horse Mode failed: ${res.error}`)
        return
      }

      let content = res.result.reply.trim()
      let wordCount = content.split(/\s+/).length
      hlog(`Iteration 1/${iterations}: ${wordCount} words (${res.result.provider}/${res.result.model})`, 'success')

      // Write initial draft
      set({ stage: 'writing' })
      await window.electronAPI.writeFile(filePath, content)
      hlog(`Draft saved to ${filePath}`)

      // ── Iterations 2..N: Refinement loop ──
      for (let i = 2; i <= iterations; i++) {
        if (get().cancelled) {
          hlog(`Cancelled at iteration ${i}`, 'error')
          break
        }

        set({ stage: 'generating', currentIteration: i })
        hlog(`Iteration ${i}/${iterations}: Refining draft...`)

        // Read the previous output (fresh context)
        const previousDraft = await window.electronAPI.readFile(filePath)

        const refineRes = await window.electronAPI.sendAgentOneShot({
          systemPrompt: REFINE_SYSTEM_PROMPT,
          prompt: `## Original Task\n\n${task}\n\n---\n\n## Current Draft (Iteration ${i - 1} of ${iterations})\n\n${previousDraft.slice(0, 12000)}\n\n---\n\nThis is refinement iteration ${i} of ${iterations}. Improve the draft above.`,
        })

        if (!refineRes.ok) {
          hlog(`Iteration ${i} failed: ${refineRes.error} — keeping previous version`, 'warning' as 'error')
          break
        }

        content = refineRes.result.reply.trim()
        wordCount = content.split(/\s+/).length
        hlog(`Iteration ${i}/${iterations}: ${wordCount} words`, 'success')

        set({ stage: 'writing' })
        await window.electronAPI.writeFile(filePath, content)
        hlog(`Updated draft saved`)
      }

      // ── Done ──
      set({ stage: 'completed' })
      hlog('Opening in PrismMD...')
      const { useFileStore } = await import('./fileStore')
      await useFileStore.getState().openFile(filePath)
      hlog(`Done! (${iterations} iteration${iterations > 1 ? 's' : ''})`, 'success')

      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('success', `Horse Mode complete! Saved to ${fileName}`, 5000)

      setTimeout(() => {
        if (get().stage === 'completed') set({ active: false, stage: 'idle' })
      }, 5000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ stage: 'failed', error: msg })
      hlog(`Error: ${msg}`, 'error')
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('error', `Horse Mode failed: ${msg}`)
    }
  },

  cancel: () => {
    set({ cancelled: true })
    hlog('Cancelling after current iteration...', 'error')
    // Don't immediately reset — let the loop check `cancelled` and exit gracefully
    setTimeout(() => {
      if (get().cancelled) {
        set({ active: false, stage: 'idle', cancelled: false })
      }
    }, 1000)
  },
}))

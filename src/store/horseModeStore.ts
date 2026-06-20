import { create } from 'zustand'
import { useAgentLogStore } from './agentLogStore'
import { usePromptConfigStore } from './promptConfigStore'
import { useSessionStore } from './sessionStore'

export type HorseModeStage = 'idle' | 'generating' | 'writing' | 'completed' | 'failed'

/**
 * Style guide that nudges Horse Mode output to read like a human wrote it
 * (toggled in the dialog). Appended to the Horse Mode system prompt, so it
 * shapes both the iterative loop and the final consolidation pass.
 */
const HUMAN_VOICE = [
  '## Writing voice',
  'Write like a real person, not an AI assistant. Match the language of the task.',
  '- Vary sentence length — mix short, punchy sentences with longer ones; avoid a uniform rhythm.',
  '- Be specific: prefer concrete examples, names and numbers over generic statements.',
  '- Take a position; make claims instead of hedging every sentence.',
  "- Cut filler and signposting: no \"it's worth noting\", \"in conclusion\", \"overall\", \"first/second/finally\", \"moreover/furthermore\".",
  '- Do not restate your own points or end with a summary unless the task asks for one.',
  '- Contractions and the occasional sentence fragment are fine. Use plain words, not buzzwords (avoid "leverage", "robust", "seamless", "delve", "tapestry").',
  '- Prefer flowing prose over bullet lists unless the content is genuinely a list.',
].join('\n')

interface HorseModeStore {
  active: boolean
  task: string
  title: string
  stage: HorseModeStage
  error: string | null
  iterations: number
  currentIteration: number
  currentPhase: string
  qualityScore: number | null
  cancelled: boolean

  start: (task: string, title: string, iterations?: number, documentContent?: string, humanVoice?: boolean) => Promise<void>
  cancel: () => void
}

function hlog(message: string, level: 'info' | 'success' | 'error' = 'info') {
  useAgentLogStore.getState().log('horse-mode', message, level)
}

export const useHorseModeStore = create<HorseModeStore>((set, get) => ({
  active: false,
  task: '',
  title: '',
  stage: 'idle',
  error: null,
  iterations: 1,
  currentIteration: 0,
  currentPhase: '',
  qualityScore: null,
  cancelled: false,

  start: async (task, title, iterations = 1, documentContent, humanVoice = true) => {
    const hasDocContext = !!documentContent?.trim()
    const pageTitle = title.trim() || 'Untitled'
    set({
      active: true, task, title: pageTitle, stage: 'generating',
      error: null, iterations, currentIteration: 1, currentPhase: 'plan',
      qualityScore: null, cancelled: false,
    })

    useAgentLogStore.getState().panelOpen || useAgentLogStore.setState({ panelOpen: true })

    hlog(`Task: ${task.slice(0, 120)}${task.length > 120 ? '...' : ''}`)
    hlog(`Page: ${pageTitle}`)
    hlog(`Max iterations: ${iterations}`)
    if (hasDocContext) hlog('Using current document as reference')

    // Subscribe to progress events — cleanup in finally to prevent leaks
    let progressCleanup: (() => void) | null = null
    try {
      // Build the system prompt from prompt config, optionally nudging the
      // output to read more like human writing.
      const basePrompt = hasDocContext
        ? usePromptConfigStore.getState().getPrompt('horse-mode-with-context')
        : usePromptConfigStore.getState().getPrompt('horse-mode')
      const systemPrompt = humanVoice ? `${basePrompt}\n\n${HUMAN_VOICE}` : basePrompt

      // Build the full task description for the autonomous loop
      const fullTask = hasDocContext
        ? `## Reference Document\n\n${documentContent!.slice(0, 12000)}\n\n---\n\n## Task\n\n${task}`
        : task

      progressCleanup = window.electronAPI.onAgentTaskProgress((progress) => {
        if (get().cancelled) return
        set({
          currentIteration: progress.iteration,
          currentPhase: progress.phase,
          qualityScore: progress.qualityScore ?? get().qualityScore,
        })
        hlog(`Iteration ${progress.iteration}: ${progress.phase}${progress.qualityScore != null ? ` (score: ${progress.qualityScore})` : ''}`)
      })

      // Run the autonomous agent task (plan → execute → review → evaluate loop)
      const res = await window.electronAPI.sendAgentTask({
        task: fullTask,
        systemPrompt,
        qualityThreshold: 7,
        maxIterations: iterations,
      })

      if (!res.ok) {
        set({ stage: 'failed', error: res.error })
        hlog(`Failed: ${res.error}`, 'error')
        const { useToastStore } = await import('./toastStore')
        useToastStore.getState().show('error', `Horse Mode failed: ${res.error}`)
        return
      }

      hlog(
        `Autonomous loop done: ${res.result.iterations} iteration(s), ` +
        `score ${res.result.qualityScore}${res.result.thresholdMet ? ' (threshold met)' : ''}`,
        'success',
      )

      // The autonomous loop output contains process narration (plan, steps,
      // review). Extract the final clean document via a consolidation call.
      hlog('Consolidating final document...')
      const consolidateRes = await window.electronAPI.sendAgentOneShot({
        systemPrompt,
        prompt: [
          '## Original Task',
          task,
          '',
          '## Raw Output (from iterative refinement)',
          res.result.result,
          '',
          '## Instructions',
          'Extract and output ONLY the final polished document from the raw output above.',
          'Remove all process notes, step numbers, planning text, review comments, and meta-commentary.',
          'Output the clean document in markdown format. Nothing else.',
        ].join('\n'),
      })

      if (!consolidateRes.ok) {
        // Fallback: use raw output if consolidation fails
        hlog('Consolidation failed, using raw output', 'error')
      }

      const content = (consolidateRes.ok ? consolidateRes.result.reply : res.result.result).trim()
      if (!content) {
        set({ stage: 'failed', error: 'Agent produced empty output' })
        hlog('Error: agent produced empty output', 'error')
        const { useToastStore } = await import('./toastStore')
        useToastStore.getState().show('error', 'Horse Mode failed: empty output')
        return
      }
      const wordCount = content.split(/\s+/).length
      hlog(`Final document: ${wordCount} words (${res.result.provider}/${res.result.model})`, 'success')

      // Create a workspace page with the generated content.
      set({ stage: 'writing' })
      const { useWorkspaceStore } = await import('./workspaceStore')
      const ws = useWorkspaceStore.getState()
      const pageId = await ws.createPage(pageTitle, null)
      if (!pageId) {
        set({ stage: 'failed', error: 'Failed to create page' })
        hlog('Error: failed to create workspace page', 'error')
        return
      }
      await ws.savePage(pageId, content)
      await ws.loadTree()
      hlog(`Saved to page "${pageTitle}"`)

      // Save as a session so it appears in the Agent panel
      try {
        const sessionId = await window.electronAPI.sessionCreate()
        await window.electronAPI.sessionSaveHistory(
          sessionId,
          [
            { role: 'user', content: task },
            {
              role: 'assistant',
              content: [
                `**Page:** ${pageTitle}`,
                `**Iterations:** ${res.result.iterations} | **Score:** ${res.result.qualityScore}/10${res.result.thresholdMet ? ' (threshold met)' : ''}`,
                `**Words:** ${wordCount}`,
                '',
                '---',
                '',
                content,
              ].join('\n'),
            },
          ],
          { source: 'horse-mode' },
        )
        await useSessionStore.getState().refreshSessions()
        hlog('Session saved to Agent panel')
      } catch {
        // Session save best-effort
      }

      // Open the new page in PrismMD.
      set({ stage: 'completed' })
      hlog('Opening in PrismMD...')
      await ws.openPage(pageId)
      hlog(`Done! (${res.result.iterations} iteration${res.result.iterations > 1 ? 's' : ''}, score: ${res.result.qualityScore})`, 'success')

      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('success', `Horse Mode complete! Created "${pageTitle}"`, 5000)

      setTimeout(() => {
        if (get().stage === 'completed') set({ active: false, stage: 'idle' })
      }, 5000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set({ stage: 'failed', error: msg })
      hlog(`Error: ${msg}`, 'error')
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('error', `Horse Mode failed: ${msg}`)
    } finally {
      progressCleanup?.()
    }
  },

  cancel: () => {
    set({ cancelled: true })
    hlog('Cancelling after current phase...', 'error')
    setTimeout(() => {
      if (get().cancelled) {
        set({ active: false, stage: 'idle', cancelled: false })
      }
    }, 1000)
  },
}))

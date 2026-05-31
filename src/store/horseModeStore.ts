import { create } from 'zustand'
import { useAgentLogStore } from './agentLogStore'
import { usePromptConfigStore } from './promptConfigStore'
import { useSessionStore } from './sessionStore'

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
  currentPhase: string
  qualityScore: number | null
  cancelled: boolean

  start: (task: string, targetDir: string, fileName: string, iterations?: number, documentContent?: string) => Promise<void>
  cancel: () => void
}

function hlog(message: string, level: 'info' | 'success' | 'error' = 'info') {
  useAgentLogStore.getState().log('horse-mode', message, level)
}

export const useHorseModeStore = create<HorseModeStore>((set, get) => ({
  active: false,
  task: '',
  targetDir: '',
  fileName: '',
  stage: 'idle',
  error: null,
  iterations: 1,
  currentIteration: 0,
  currentPhase: '',
  qualityScore: null,
  cancelled: false,

  start: async (task, targetDir, fileName, iterations = 1, documentContent) => {
    const hasDocContext = !!documentContent?.trim()
    set({
      active: true, task, targetDir, fileName, stage: 'generating',
      error: null, iterations, currentIteration: 1, currentPhase: 'plan',
      qualityScore: null, cancelled: false,
    })

    useAgentLogStore.getState().panelOpen || useAgentLogStore.setState({ panelOpen: true })

    hlog(`Task: ${task.slice(0, 120)}${task.length > 120 ? '...' : ''}`)
    hlog(`Target: ${targetDir}/${fileName}`)
    hlog(`Max iterations: ${iterations}`)
    if (hasDocContext) hlog('Using current document as reference')

    const filePath = `${targetDir}/${fileName}`

    try {
      // Build the system prompt from prompt config
      const systemPrompt = hasDocContext
        ? usePromptConfigStore.getState().getPrompt('horse-mode-with-context')
        : usePromptConfigStore.getState().getPrompt('horse-mode')

      // Build the full task description for the autonomous loop
      const fullTask = hasDocContext
        ? `## Reference Document\n\n${documentContent!.slice(0, 12000)}\n\n---\n\n## Task\n\n${task}`
        : task

      // Subscribe to progress events
      const cleanup = window.electronAPI.onAgentTaskProgress((progress) => {
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

      cleanup()

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
      const wordCount = content.split(/\s+/).length
      hlog(`Final document: ${wordCount} words (${res.result.provider}/${res.result.model})`, 'success')

      // Write final output to file
      set({ stage: 'writing' })
      await window.electronAPI.writeFile(filePath, content)
      hlog(`Saved to ${filePath}`)

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
                `**File:** \`${filePath}\``,
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

      // Open in PrismMD
      set({ stage: 'completed' })
      hlog('Opening in PrismMD...')
      const { useFileStore } = await import('./fileStore')
      const finalContent = await window.electronAPI.readFile(filePath)
      await useFileStore.getState().openFile(filePath)
      useFileStore.getState().setContent(finalContent)
      hlog(`Done! (${res.result.iterations} iteration${res.result.iterations > 1 ? 's' : ''}, score: ${res.result.qualityScore})`, 'success')

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
    hlog('Cancelling after current phase...', 'error')
    setTimeout(() => {
      if (get().cancelled) {
        set({ active: false, stage: 'idle', cancelled: false })
      }
    }, 1000)
  },
}))

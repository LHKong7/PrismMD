import { create } from 'zustand'

export type HorseModeStage = 'idle' | 'generating' | 'writing' | 'completed' | 'failed'

interface HorseModeStore {
  active: boolean
  task: string
  targetDir: string
  fileName: string
  stage: HorseModeStage
  error: string | null

  start: (task: string, targetDir: string, fileName: string) => Promise<void>
  cancel: () => void
}

const SYSTEM_PROMPT = `You are an expert writer. Write a complete, well-structured markdown document based on the user's request.

Rules:
- Include a title (# heading), well-organized sections with headings, and proper markdown formatting.
- Use lists, code blocks, blockquotes, bold/italic as appropriate for the content type.
- Write in the same language as the user's request.
- The document should be thorough and publication-ready.
- Output ONLY the document content — no meta-commentary, no explanations, no wrapping.`

export const useHorseModeStore = create<HorseModeStore>((set, get) => ({
  active: false,
  task: '',
  targetDir: '',
  fileName: '',
  stage: 'idle',
  error: null,

  start: async (task, targetDir, fileName) => {
    set({ active: true, task, targetDir, fileName, stage: 'generating', error: null })

    try {
      // Generate the document
      const res = await window.electronAPI.sendAgentOneShot({
        systemPrompt: SYSTEM_PROMPT,
        prompt: task,
      })

      if (!res.ok) {
        set({ stage: 'failed', error: res.error })
        const { useToastStore } = await import('./toastStore')
        useToastStore.getState().show('error', `Horse Mode failed: ${res.error}`)
        return
      }

      const content = res.result.reply.trim()

      // Write the file
      set({ stage: 'writing' })
      const filePath = `${targetDir}/${fileName}`
      await window.electronAPI.writeFile(filePath, content)

      // Open the file in PrismMD
      set({ stage: 'completed' })
      const { useFileStore } = await import('./fileStore')
      await useFileStore.getState().openFile(filePath)

      // Notify the user
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('success', `Horse Mode complete! Saved to ${fileName}`, 5000)

      // Reset after a brief delay
      setTimeout(() => {
        if (get().stage === 'completed') {
          set({ active: false, stage: 'idle' })
        }
      }, 3000)
    } catch (err) {
      set({ stage: 'failed', error: err instanceof Error ? err.message : String(err) })
      const { useToastStore } = await import('./toastStore')
      useToastStore.getState().show('error', `Horse Mode failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  },

  cancel: () => {
    set({ active: false, task: '', targetDir: '', fileName: '', stage: 'idle', error: null })
  },
}))

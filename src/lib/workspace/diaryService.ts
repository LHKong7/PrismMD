import { useFileStore } from '../../store/fileStore'
import { useTemplateStore } from '../../store/templateStore'

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

function getDiaryDir(): string | null {
  const folders = useFileStore.getState().openFolders
  if (folders.length === 0) return null
  return `${folders[0].path}/diary`
}

function getDiaryPath(date: Date): string | null {
  const dir = getDiaryDir()
  if (!dir) return null
  return `${dir}/${formatDate(date)}.md`
}

function getDiaryContent(): string {
  // Try to use the Daily Journal template
  const templates = useTemplateStore.getState().templates
  const journal = templates.find((t) => t.name === 'Daily Journal')
  if (journal) {
    return journal.content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
  }

  // Fallback
  const today = new Date().toLocaleDateString()
  return `# Journal — ${today}\n\n## Today's Highlights\n-\n\n## What I Learned\n\n\n## Challenges\n\n\n## Tomorrow's Plan\n- [ ]\n- [ ]\n\n## Mood:\n`
}

/**
 * Open today's diary file. Creates it from the Daily Journal template if it doesn't exist.
 * Creates the diary/ directory if needed.
 */
export async function openTodayDiary(): Promise<boolean> {
  const dir = getDiaryDir()
  if (!dir) {
    const { useToastStore } = await import('../../store/toastStore')
    useToastStore.getState().show('error', 'Please open a folder first to use the diary.')
    return false
  }

  const filePath = getDiaryPath(new Date())!

  // Create diary directory if needed
  const dirExists = await window.electronAPI.exists(dir)
  if (!dirExists) {
    await window.electronAPI.createDirectory(dir)
  }

  // Create diary file if needed
  const fileExists = await window.electronAPI.exists(filePath)
  if (!fileExists) {
    await window.electronAPI.writeFile(filePath, getDiaryContent())
  }

  // Open the file
  await useFileStore.getState().openFile(filePath)

  // Enter edit mode
  const { useEditorStore } = await import('../../store/editorStore')
  useEditorStore.getState().setEditing(true)

  return true
}

/**
 * Get diary file paths for the past N days (for weekly summary).
 */
export async function getRecentDiaryPaths(days = 7): Promise<string[]> {
  const dir = getDiaryDir()
  if (!dir) return []

  const paths: string[] = []
  const now = new Date()

  for (let i = 0; i < days; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const filePath = `${dir}/${formatDate(date)}.md`
    const exists = await window.electronAPI.exists(filePath)
    if (exists) paths.push(filePath)
  }

  return paths
}

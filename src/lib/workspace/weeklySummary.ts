import { useFileStore } from '../../store/fileStore'
import { useTaskStore } from '../../plugins/workspace/useTaskStore'
import { useAgentLogStore } from '../../store/agentLogStore'
import { getRecentDiaryPaths } from './diaryService'

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export async function generateWeeklySummary(): Promise<boolean> {
  const log = (msg: string, level: 'info' | 'success' | 'error' = 'info') =>
    useAgentLogStore.getState().log('system', msg, level)

  const folders = useFileStore.getState().openFolders
  if (folders.length === 0) {
    const { useToastStore } = await import('../../store/toastStore')
    useToastStore.getState().show('error', 'Please open a folder first.')
    return false
  }

  log('Generating weekly summary...')

  // Collect diary entries from past 7 days
  const diaryPaths = await getRecentDiaryPaths(7)
  const diaryContents: string[] = []
  for (const p of diaryPaths) {
    try {
      const content = await window.electronAPI.readFile(p)
      diaryContents.push(`--- ${p.split('/').pop()} ---\n${content}`)
    } catch { /* skip */ }
  }

  // Collect completed tasks
  const completedTasks = useTaskStore.getState().recentCompleted(20)
  const taskList = completedTasks.map((t) => `- ${t.title}`).join('\n')

  if (diaryContents.length === 0 && completedTasks.length === 0) {
    const { useToastStore } = await import('../../store/toastStore')
    useToastStore.getState().show('error', 'No diary entries or completed tasks found for the past week.')
    return false
  }

  log(`Found ${diaryContents.length} diary entries, ${completedTasks.length} completed tasks`)

  // Build context
  const context = [
    diaryContents.length > 0 ? `## Diary Entries (Past 7 Days)\n\n${diaryContents.join('\n\n')}` : '',
    completedTasks.length > 0 ? `## Completed Tasks\n\n${taskList}` : '',
  ].filter(Boolean).join('\n\n---\n\n')

  // Call AI
  log('Sending to AI for summary...')
  try {
    const res = await window.electronAPI.sendAgentOneShot({
      systemPrompt: `You are a personal productivity assistant. Write a thoughtful, concise weekly review based on the user's diary entries and completed tasks. Include:
1. Key accomplishments this week
2. Themes and patterns you noticed
3. Challenges faced
4. Suggestions for next week
Write in the same language as the diary entries. Format as markdown.`,
      prompt: context.slice(0, 12000),
    })

    if (!res.ok) {
      log(`Failed: ${res.error}`, 'error')
      const { useToastStore } = await import('../../store/toastStore')
      useToastStore.getState().show('error', `Weekly summary failed: ${res.error}`)
      return false
    }

    // Save file
    const now = new Date()
    const year = now.getFullYear()
    const week = getWeekNumber(now).toString().padStart(2, '0')
    const dir = `${folders[0].path}/diary`

    const dirExists = await window.electronAPI.exists(dir)
    if (!dirExists) await window.electronAPI.createDirectory(dir)

    const filePath = `${dir}/weekly-${year}-W${week}.md`
    await window.electronAPI.writeFile(filePath, res.result.reply.trim())

    log(`Saved to ${filePath}`, 'success')

    await useFileStore.getState().openFile(filePath)

    const { useToastStore } = await import('../../store/toastStore')
    useToastStore.getState().show('success', 'Weekly summary generated!')
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`Error: ${msg}`, 'error')
    const { useToastStore } = await import('../../store/toastStore')
    useToastStore.getState().show('error', `Weekly summary failed: ${msg}`)
    return false
  }
}

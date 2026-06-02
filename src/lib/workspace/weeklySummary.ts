import { useWorkspaceStore } from '../../store/workspaceStore'
import { useTaskStore } from '../../plugins/workspace/useTaskStore'
import { useAgentLogStore } from '../../store/agentLogStore'
import { getRecentDiaryPageIds } from './diaryService'

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

  log('Generating weekly summary...')

  // Collect diary entries from past 7 days (workspace pages)
  const diaryPageIds = await getRecentDiaryPageIds(7)
  const diaryContents: string[] = []
  for (const id of diaryPageIds) {
    try {
      const page = await window.electronAPI.workspaceGetPage(id)
      if (page) diaryContents.push(`--- ${page.title} ---\n${page.content}`)
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

    // Create a workspace page for the summary.
    const now = new Date()
    const year = now.getFullYear()
    const week = getWeekNumber(now).toString().padStart(2, '0')
    const title = `Weekly Review ${year}-W${week}`

    const ws = useWorkspaceStore.getState()
    const pageId = await ws.createPage(title, null)
    if (pageId) {
      await ws.savePage(pageId, res.result.reply.trim())
      await ws.loadTree()
      await ws.openPage(pageId)
    }

    log(`Created page "${title}"`, 'success')

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

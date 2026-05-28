import { CheckSquare } from 'lucide-react'
import { TaskPanel } from './TaskPanel'
import type { Plugin } from '../../lib/plugins/types'

const workspacePlugin: Plugin = {
  id: 'prismmd.workspace',
  name: 'Workspace',
  version: '0.1.0',
  description: 'Personal workspace: task tracker, diary, and weekly summary.',

  activate(host) {
    // Task tracker sidebar panel
    host.registerSidebarPanel({
      id: 'tasks',
      title: 'Tasks',
      icon: CheckSquare,
      component: TaskPanel,
    })

    // Open today's diary
    host.registerCommand({
      id: 'prismmd.workspace.diary',
      title: "Open Today's Diary",
      group: 'Workspace',
      handler: async () => {
        const { openTodayDiary } = await import('../../lib/workspace/diaryService')
        await openTodayDiary()
      },
    })

    // Generate weekly summary
    host.registerCommand({
      id: 'prismmd.workspace.weekly-summary',
      title: 'Generate Weekly Summary',
      group: 'Workspace',
      handler: async () => {
        const { generateWeeklySummary } = await import('../../lib/workspace/weeklySummary')
        await generateWeeklySummary()
      },
    })
  },
}

export default workspacePlugin

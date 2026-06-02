import { useWorkspaceStore } from '../../store/workspaceStore'
import { useTemplateStore } from '../../store/templateStore'
import type { PageTreeNode } from '../../types/electron'

const DIARY_PARENT_TITLE = 'Diary'

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10) // YYYY-MM-DD
}

function getDiaryContent(): string {
  // Try to use the Daily Journal template
  const templates = useTemplateStore.getState().templates
  const journal = templates.find((t) => t.name === 'Daily Journal')
  if (journal) {
    return journal.content.replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
  }
  const today = new Date().toLocaleDateString()
  return `# Journal — ${today}\n\n## Today's Highlights\n-\n\n## What I Learned\n\n\n## Challenges\n\n\n## Tomorrow's Plan\n- [ ]\n- [ ]\n\n## Mood:\n`
}

/** Find the root "Diary" page in the current tree, if any. */
function findDiaryParent(tree: PageTreeNode[]): PageTreeNode | null {
  return tree.find((n) => n.title === DIARY_PARENT_TITLE) ?? null
}

/** Ensure a root "Diary" page exists; returns its ID. */
async function ensureDiaryParent(): Promise<string> {
  const ws = useWorkspaceStore.getState()
  await ws.loadTree()
  const existing = findDiaryParent(useWorkspaceStore.getState().pageTree)
  if (existing) return existing.id
  const id = await ws.createPage(DIARY_PARENT_TITLE, null)
  await ws.loadTree()
  return id ?? ''
}

/**
 * Open today's diary page. Creates it (and the Diary parent) from the Daily
 * Journal template if it doesn't exist.
 */
export async function openTodayDiary(): Promise<boolean> {
  const ws = useWorkspaceStore.getState()
  const parentId = await ensureDiaryParent()
  if (!parentId) return false

  const dateTitle = formatDate(new Date())
  const parent = findDiaryParent(useWorkspaceStore.getState().pageTree)
  const existingChild = parent?.children.find((c) => c.title === dateTitle)

  let pageId = existingChild?.id
  if (!pageId) {
    pageId = (await ws.createPage(dateTitle, parentId)) ?? undefined
    if (!pageId) return false
    await ws.savePage(pageId, getDiaryContent())
    await ws.loadTree()
  }

  await ws.openPage(pageId)
  const { useEditorStore } = await import('../../store/editorStore')
  useEditorStore.getState().setEditing(true)
  return true
}

/**
 * Get the page IDs of recent diary entries (titled by date) for the past N days.
 */
export async function getRecentDiaryPageIds(days = 7): Promise<string[]> {
  const ws = useWorkspaceStore.getState()
  await ws.loadTree()
  const parent = findDiaryParent(useWorkspaceStore.getState().pageTree)
  if (!parent) return []

  const validTitles = new Set<string>()
  const now = new Date()
  for (let i = 0; i < days; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    validTitles.add(formatDate(date))
  }

  return parent.children.filter((c) => validTitles.has(c.title)).map((c) => c.id)
}

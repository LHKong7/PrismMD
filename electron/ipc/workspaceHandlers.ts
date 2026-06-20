/**
 * Workspace IPC Handlers — bridges renderer to document service.
 */
import { ipcMain, dialog } from 'electron'
import {
  createPage,
  getPage,
  updatePage,
  deletePage,
  restorePage,
  getChildren,
  getPageTree,
  movePage,
  getAncestors,
  searchPages,
  importMarkdown,
  importFolder,
  exportMarkdown,
  getPageCount,
  ensureWelcomePage,
} from '../services/documentService'
import { getMainWindow } from '../main'

export function registerWorkspaceHandlers() {
  // Seed a welcome page on first launch so the workspace isn't empty.
  try {
    ensureWelcomePage()
  } catch (err) {
    console.error('[workspace] Failed to seed welcome page:', err)
  }

  // ── Page CRUD ──

  ipcMain.handle('workspace:create-page', async (_event, title?: string, parentId?: string, content?: string) => {
    try {
      return { ok: true, page: createPage(title, parentId, content) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:create-folder', async (_event, title?: string, parentId?: string) => {
    try {
      return { ok: true, page: createPage(title ?? 'New Folder', parentId, '', 'md', true) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:get-page', async (_event, pageId: string) => {
    return getPage(pageId)
  })

  ipcMain.handle('workspace:update-page', async (_event, pageId: string, updates: Record<string, any>) => {
    try {
      updatePage(pageId, updates)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:delete-page', async (_event, pageId: string) => {
    try {
      deletePage(pageId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:restore-page', async (_event, pageId: string) => {
    try {
      restorePage(pageId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Tree queries ──

  ipcMain.handle('workspace:get-children', async (_event, parentId: string | null) => {
    return getChildren(parentId)
  })

  ipcMain.handle('workspace:get-tree', async () => {
    return getPageTree()
  })

  ipcMain.handle('workspace:move-page', async (_event, pageId: string, newParentId: string | null, position: number) => {
    try {
      movePage(pageId, newParentId, position)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:get-ancestors', async (_event, pageId: string) => {
    return getAncestors(pageId)
  })

  ipcMain.handle('workspace:search', async (_event, query: string) => {
    return searchPages(query)
  })

  ipcMain.handle('workspace:get-page-count', async () => {
    return getPageCount()
  })

  // ── Import / Export ──

  ipcMain.handle('workspace:import-file', async (_event, parentId?: string) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }

    try {
      const pages = result.filePaths.map((fp) => importMarkdown(fp, parentId))
      return { ok: true, pages }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:import-folder', async (_event, parentId?: string) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }

    try {
      const pages = importFolder(result.filePaths[0], parentId)
      return { ok: true, count: pages.length }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('workspace:export-page', async (_event, pageId: string) => {
    const page = getPage(pageId)
    if (!page) return { ok: false, error: 'Page not found' }

    const win = getMainWindow()
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `${page.title}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    try {
      exportMarkdown(pageId, result.filePath)
      return { ok: true, filePath: result.filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

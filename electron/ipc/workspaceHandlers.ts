/**
 * Workspace IPC Handlers — bridges the renderer to the note repo().
 *
 * Storage is reached only through `getNoteRepository()`; nothing in here
 * imports `documentService` directly. That is what lets the Markdown-vault
 * backend drop in without this file changing (see
 * `recordDocs/2026-08-25-vault-migration-plan.md`).
 *
 * Index maintenance stays here rather than inside the repository: writing a
 * note and *describing* a note are different jobs, and the index has to be
 * able to fall behind (debounced) without the write waiting on it.
 */
import { ipcMain, dialog } from 'electron'
import { getNoteRepository } from '../repositories/repositoryFactory'
import { getAsset } from '../services/assetService'
import {
  forgetPage,
  indexPageNow,
  scheduleIndex,
  searchPageSummaries,
  syncWorkspaceIndex,
} from '../services/knowledgeService'
import { openDialogFilters } from '../services/fileFormats'
import { areWritesSuspended } from '../services/storageService'
import { getMainWindow } from '../main'

function fail(err: unknown) {
  return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
}

/**
 * ★ A migration copies every note; a write landing halfway through goes into
 * the store being left behind and is never seen again. The renderer autosaves
 * on a debounce, so this is not hypothetical — it is what happens if someone
 * keeps typing while the progress bar runs. Refusing the write surfaces as a
 * save error the user can act on; accepting it loses the paragraph silently.
 */
function suspended() {
  return { ok: false as const, error: 'A migration is in progress. Your last edit was not saved.' }
}

export function registerWorkspaceHandlers() {
  // ★ Resolved per call, never captured. A migration swaps the active
  // repository at runtime, and a handler holding the old one would keep
  // writing into the database the user just migrated away from — with every
  // write appearing to succeed.
  const repo = () => getNoteRepository()

  // ── Page CRUD ──

  ipcMain.handle('workspace:create-page', async (_event, title?: string, parentId?: string, content?: string) => {
    if (areWritesSuspended()) return suspended()
    try {
      const page = await repo().createPage({ title, parentId, content })
      // Indexed immediately rather than on a debounce: a brand-new note's
      // title is what resolves every [[link]] someone already wrote to it,
      // and waiting a second and a half to say so looks like a broken link.
      await indexPageNow(page.id)
      return { ok: true, page }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('workspace:create-folder', async (_event, title?: string, parentId?: string) => {
    if (areWritesSuspended()) return suspended()
    try {
      return { ok: true, page: await repo().createFolder({ title, parentId }) }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('workspace:get-page', async (_event, pageId: string) => {
    return repo().getPage(pageId)
  })

  ipcMain.handle('workspace:update-page', async (_event, pageId: string, updates: Record<string, any>) => {
    if (areWritesSuspended()) return suspended()
    try {
      // A title change is a rename, not a field write: it renames the note
      // *and* rewrites every [[link]] that pointed at the old title. The
      // repository owns both halves because between them the workspace is
      // inconsistent — see SqliteNoteRepository.renamePage.
      if (updates.title !== undefined) {
        const { relinked } = await repo().renamePage(pageId, String(updates.title))
        await indexPageNow(pageId)
        for (const note of relinked) await indexPageNow(note.pageId)

        // The ids go back to the renderer because those notes' text changed
        // underneath any tab that has them open — a stale tab would autosave
        // the pre-rewrite content straight back over the fix.
        const { title: _title, ...rest } = updates
        if (Object.keys(rest).length > 0) await repo().updatePage(pageId, rest)
        return { ok: true, relinkedPageIds: relinked.map((n) => n.pageId) }
      }

      await repo().updatePage(pageId, updates)
      // Content edits arrive on every autosave tick, so they are debounced.
      scheduleIndex(pageId)
      return { ok: true }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('workspace:delete-page', async (_event, pageId: string) => {
    if (areWritesSuspended()) return suspended()
    try {
      await repo().deletePage(pageId)
      await forgetPage(pageId)
      // deletePage cascades to descendants, so a full reconcile is the only
      // way to evict them all — one pass over unchanged notes is a hash each.
      await syncWorkspaceIndex()
      return { ok: true }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('workspace:restore-page', async (_event, pageId: string) => {
    if (areWritesSuspended()) return suspended()
    try {
      await repo().restorePage(pageId)
      await syncWorkspaceIndex()
      return { ok: true }
    } catch (err) {
      return fail(err)
    }
  })

  // ── Tree queries ──

  ipcMain.handle('workspace:get-children', async (_event, parentId: string | null) => {
    return repo().getChildren(parentId)
  })

  ipcMain.handle('workspace:get-tree', async () => {
    return repo().getTree()
  })

  ipcMain.handle('workspace:move-page', async (_event, pageId: string, newParentId: string | null, position: number) => {
    if (areWritesSuspended()) return suspended()
    try {
      await repo().movePage(pageId, newParentId, position)
      return { ok: true }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('workspace:get-ancestors', async (_event, pageId: string) => {
    return repo().getAncestors(pageId)
  })

  ipcMain.handle('workspace:search', async (_event, query: string) => {
    // Ranked, index-backed results; the repository's substring scan remains
    // the fallback so a partial word ("sched") still finds something the
    // tokenizer cannot produce a term for.
    try {
      const ranked = await searchPageSummaries(query)
      if (ranked.length > 0) return ranked
    } catch (err) {
      console.error('[workspace] Knowledge search failed, falling back:', err)
    }
    return repo().searchPages(query)
  })

  ipcMain.handle('workspace:get-page-count', async () => {
    return repo().countPages()
  })

  // ── Import / Export ──

  ipcMain.handle('workspace:import-file', async (_event, parentId?: string) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: openDialogFilters(),
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }

    try {
      const pages = []
      for (const filePath of result.filePaths) {
        const page = await repo().importFile(filePath, parentId)
        await indexPageNow(page.id)
        pages.push(page)
      }
      return { ok: true, pages }
    } catch (err) {
      return fail(err)
    }
  })

  // Drag-and-drop: the renderer only has a File object, so it reads the
  // bytes itself and hands them over here.
  ipcMain.handle(
    'workspace:import-dropped-file',
    async (_event, fileName: string, data: Uint8Array, parentId?: string) => {
      if (areWritesSuspended()) return suspended()
      try {
        const page = await repo().importDroppedFile(fileName, data, parentId)
        await indexPageNow(page.id)
        return { ok: true, page }
      } catch (err) {
        return fail(err)
      }
    },
  )

  // ── Binary payloads ──

  ipcMain.handle('workspace:get-page-bytes', async (_event, pageId: string) => {
    // Through the repository, not the asset store: in a vault the PDF *is* a
    // file in the vault, and reaching straight for the asset store would find
    // nothing there.
    return repo().readPageBytes(pageId)
  })

  ipcMain.handle('workspace:get-page-asset', async (_event, pageId: string) => {
    return getAsset(pageId)
  })

  ipcMain.handle('workspace:import-folder', async (_event, parentId?: string) => {
    const win = getMainWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true }

    try {
      const pages = await repo().importFolder(result.filePaths[0], parentId)
      // A folder import can be hundreds of files; one reconcile covers them
      // all and skips whatever was already indexed.
      await syncWorkspaceIndex()
      return { ok: true, count: pages.length }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('workspace:export-page', async (_event, pageId: string) => {
    const page = await repo().getPage(pageId)
    if (!page) return { ok: false, error: 'Page not found' }

    const win = getMainWindow()
    const defaultName = await repo().exportFileNameFor(page)
    const ext = defaultName.slice(defaultName.lastIndexOf('.') + 1)
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }

    try {
      await repo().exportPage(pageId, result.filePath)
      return { ok: true, filePath: result.filePath }
    } catch (err) {
      return fail(err)
    }
  })
}

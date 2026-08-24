/**
 * Knowledge IPC — search, the link graph, and index maintenance.
 *
 * Every handler returns `{ ok, ... }` rather than throwing across the bridge,
 * matching the rest of this directory: the renderer treats a knowledge panel
 * that cannot load as an empty panel, never as a crash.
 */
import { ipcMain } from 'electron'
import {
  backlinks,
  indexPageNow,
  noteContext,
  notesByTag,
  orphans,
  outgoing,
  propagateRename,
  rebuildIndex,
  related,
  retrieve,
  search,
  stats,
  syncWorkspaceIndex,
  tags,
  unresolved,
} from '../services/knowledgeService'

export function registerKnowledgeHandlers() {
  ipcMain.handle(
    'knowledge:search',
    async (
      _event,
      query: string,
      options?: { limit?: number; contextPageId?: string; excludePageIds?: string[] },
    ) => {
      try {
        return { ok: true, hits: search(query, options) }
      } catch (err) {
        return { ok: false, error: message(err) }
      }
    },
  )

  ipcMain.handle('knowledge:note-context', async (_event, pageId: string) => {
    try {
      return { ok: true, ...noteContext(pageId) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:backlinks', async (_event, pageId: string) => {
    try {
      return { ok: true, links: backlinks(pageId) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:outgoing', async (_event, pageId: string) => {
    try {
      return { ok: true, links: outgoing(pageId) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:related', async (_event, pageId: string, limit?: number) => {
    try {
      return { ok: true, notes: related(pageId, limit) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:unresolved', async (_event, limit?: number) => {
    try {
      return { ok: true, links: unresolved(limit) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:orphans', async (_event, limit?: number) => {
    try {
      return { ok: true, notes: orphans(limit) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:tags', async (_event, limit?: number) => {
    try {
      return { ok: true, tags: tags(limit) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:notes-by-tag', async (_event, tag: string, limit?: number) => {
    try {
      return { ok: true, notes: notesByTag(tag, limit) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('knowledge:stats', async () => {
    try {
      return { ok: true, stats: stats() }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  /**
   * Retrieval for the AI assistant: numbered passages plus the citations
   * those numbers resolve to.
   */
  ipcMain.handle(
    'knowledge:retrieve',
    async (_event, query: string, options?: { maxPassages?: number; contextPageId?: string }) => {
      try {
        return { ok: true, ...retrieve(query, options) }
      } catch (err) {
        return { ok: false, error: message(err) }
      }
    },
  )

  /** Index one page right now — used after a save the renderer wants reflected. */
  ipcMain.handle('knowledge:index-page', async (_event, pageId: string) => {
    try {
      return { ok: true, changed: indexPageNow(pageId) }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  /**
   * `force` (the panel's Rebuild button) throws the derived tables away and
   * builds them again; without it this is only a reconcile pass.
   */
  ipcMain.handle('knowledge:reindex', async (_event, force?: boolean) => {
    try {
      return { ok: true, report: force === false ? syncWorkspaceIndex() : rebuildIndex() }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle(
    'knowledge:propagate-rename',
    async (_event, pageId: string, oldTitle: string, newTitle: string) => {
      try {
        return { ok: true, ...propagateRename(pageId, oldTitle, newTitle) }
      } catch (err) {
        return { ok: false, error: message(err) }
      }
    },
  )
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

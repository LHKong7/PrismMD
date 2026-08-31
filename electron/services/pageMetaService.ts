/**
 * Per-page editorial metadata — status / genre / quality — backing the
 * "book-skin" taxonomy on the shelves.
 *
 * ★ A facade over the repository, not a table. Where it is kept depends on
 * where the notes are kept: a `page_meta` row in SQLite mode, front matter in
 * a vault. That choice belongs to the backend, because it is the backend that
 * knows what its own truth is — a service reaching for `page_meta` directly
 * would work in one mode and silently do nothing in the other, which is
 * exactly what it used to do.
 */
import { getNoteRepository } from '../repositories/repositoryFactory'
import type { NoteMeta, NoteMetaListItem } from '../repositories/noteRepository'

export type PageStatus = 'draft' | 'done' | 'revise' | 'hot'
export type PageGenre = 'tech' | 'biz' | 'essay' | 'note'

export type PageMeta = NoteMeta
export type PageMetaListItem = NoteMetaListItem

export function getPageMeta(pageId: string): Promise<PageMeta | null> {
  return getNoteRepository().getNoteMeta(pageId)
}

export function setPageMeta(pageId: string, partial: Partial<PageMeta>): Promise<PageMeta> {
  return getNoteRepository().setNoteMeta(pageId, partial)
}

export function listPageMeta(): Promise<PageMetaListItem[]> {
  return getNoteRepository().listNoteMeta()
}

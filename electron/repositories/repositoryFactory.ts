/**
 * Which storage backend this process is using.
 *
 * ★ One resolver, not a lookup at each call site. When the vault backend
 * lands, "which store am I talking to" must have exactly one answer at any
 * moment — two call sites disagreeing about it is how you get a note written
 * to one store and indexed from the other, which reads as data loss and is
 * near-impossible to reproduce.
 *
 * `storageMode` is not read from settings yet: stage 1 ships the seam, not
 * the choice. When it does become a setting, it is resolved here and nowhere
 * else, and an unrecognized value has to be shouted about at startup rather
 * than silently defaulting — a workspace pointed at the wrong backend looks
 * exactly like an empty workspace.
 */
import { SqliteNoteRepository } from './sqliteNoteRepository'
import type { NoteRepository } from './noteRepository'

let current: NoteRepository | null = null

export function getNoteRepository(): NoteRepository {
  if (!current) current = new SqliteNoteRepository()
  return current
}

/**
 * Swap the active repository. Used by the storage-mode switch (stage 3) and
 * by tests that want a repository over a temp directory.
 */
export function setNoteRepository(repository: NoteRepository | null): void {
  current = repository
}

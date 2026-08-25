/**
 * Which storage backend this process is using.
 *
 * ★ One resolver, not a lookup at each call site. When vault mode is switched
 * on, "which store am I talking to" must have exactly one answer at any
 * moment — two call sites disagreeing about it is how you get a note written
 * to one store and indexed from the other, which reads as data loss and is
 * near-impossible to reproduce.
 *
 * Stage 2 builds the vault backend but does **not** select it. Nothing calls
 * `useVaultRepository` yet outside tests: switching a real workspace over is
 * stage 3's job, and it needs the migration and its verification to exist
 * first. Shipping the switch before the migration would give people a way to
 * end up with half their notes in each store.
 */
import type { Database } from 'better-sqlite3'
import { SqliteNoteRepository } from './sqliteNoteRepository'
import type { NoteRepository } from './noteRepository'

export type StorageMode = 'sqlite' | 'vault'

let current: NoteRepository | null = null

export function getNoteRepository(): NoteRepository {
  if (!current) current = new SqliteNoteRepository()
  return current
}

/** The backend currently in use, for logs and the settings panel. */
export function storageMode(): StorageMode {
  return getNoteRepository().kind
}

/**
 * Point the app at a vault directory.
 *
 * Imported lazily so the vault module — and the file walking it does at
 * construction — stays out of the startup path of a workspace that is still
 * on SQLite.
 */
export async function useVaultRepository(root: string, db: Database): Promise<NoteRepository> {
  const { MarkdownVaultRepository } = await import('../vault/markdownVaultRepository')
  const repository = new MarkdownVaultRepository({ root, db })
  await repository.scan()
  current = repository
  return repository
}

/**
 * Swap the active repository. Used by the storage-mode switch (stage 3) and
 * by tests that want a repository over a temp directory.
 */
export function setNoteRepository(repository: NoteRepository | null): void {
  current = repository
}

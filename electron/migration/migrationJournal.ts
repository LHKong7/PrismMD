/**
 * A record on disk of a migration in progress.
 *
 * ★ The migration's dangerous window is short but real: between "the temp
 * vault is complete" and "storage mode says vault", a crash leaves a folder
 * full of the user's notes that nothing knows about. Without a journal, the
 * next launch sees a normal SQLite workspace and a mysterious directory, and
 * the honest thing — telling the user what happened — is impossible.
 *
 * The journal is deliberately dumb: a small JSON file, written at each step,
 * deleted on success. It does not attempt automatic recovery. A migration is
 * a once-in-a-workspace event that the user started on purpose; resuming it
 * unattended after a crash is more likely to compound the problem than fix
 * it. What this buys is that the situation is *legible* afterwards.
 */
import * as fs from 'fs'
import * as path from 'path'
import { atomicWriteFile } from '../vault/atomicWrite'

export type MigrationStep =
  | 'started'
  | 'backed-up'
  | 'writing-notes'
  | 'notes-written'
  | 'validating'
  | 'validated'
  | 'swapping'
  | 'done'
  | 'failed'

export interface MigrationJournalEntry {
  step: MigrationStep
  startedAt: number
  updatedAt: number
  /** Where the finished vault will live. */
  targetPath: string
  /** Where it is being assembled. */
  stagingPath: string
  /** Where the pre-migration database was copied. */
  backupPath: string | null
  sourceNoteCount: number
  writtenNoteCount: number
  error: string | null
}

export class MigrationJournal {
  private entry: MigrationJournalEntry | null = null

  constructor(private readonly file: string) {}

  async begin(init: {
    targetPath: string
    stagingPath: string
    sourceNoteCount: number
  }): Promise<void> {
    const now = Date.now()
    this.entry = {
      step: 'started',
      startedAt: now,
      updatedAt: now,
      targetPath: init.targetPath,
      stagingPath: init.stagingPath,
      backupPath: null,
      sourceNoteCount: init.sourceNoteCount,
      writtenNoteCount: 0,
      error: null,
    }
    await this.persist()
  }

  async advance(step: MigrationStep, patch: Partial<MigrationJournalEntry> = {}): Promise<void> {
    if (!this.entry) return
    this.entry = { ...this.entry, ...patch, step, updatedAt: Date.now() }
    await this.persist()
  }

  /** Remove the journal. Called only once the migration has actually landed. */
  async clear(): Promise<void> {
    this.entry = null
    await fs.promises.rm(this.file, { force: true }).catch(() => {})
  }

  private async persist(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    await atomicWriteFile(this.file, `${JSON.stringify(this.entry, null, 2)}\n`)
  }
}

/**
 * An interrupted migration, if there is one.
 *
 * Read at startup so the app can say "a migration was interrupted; your notes
 * are still in the original database and a partial copy is at <path>" instead
 * of pretending nothing happened.
 */
export function readJournal(file: string): MigrationJournalEntry | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as MigrationJournalEntry
    return parsed?.step ? parsed : null
  } catch {
    return null
  }
}

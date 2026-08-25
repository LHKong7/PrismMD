/**
 * What to do when a note changes on disk while it is open in the editor.
 *
 * ★ The one outcome that is never acceptable is a silent overwrite — in
 * either direction. Discarding the user's unsaved paragraph because Dropbox
 * touched the file is data loss; clobbering the disk version with a stale
 * buffer is data loss with extra steps. When both sides have changed, the
 * only honest move is to say so and let the person decide.
 *
 * The decision is a pure function so it can be tested exhaustively: the state
 * space is small (three booleans) and every cell of it is a real situation
 * somebody will hit.
 */

export type ConflictVerdict =
  /** Nothing to do; what is on disk is what we already have. */
  | 'in-sync'
  /** Disk moved, the editor has nothing at stake — refresh silently. */
  | 'refresh'
  /** Only the editor moved; its next save carries the change. */
  | 'local-pending'
  /** Both moved. Ask. */
  | 'conflict'

export interface ConflictInput {
  /** Hash of the bytes now on disk. */
  diskHash: string
  /** Hash we recorded the last time this process read or wrote the file. */
  knownHash: string
  /** The editor holds edits that have not reached disk. */
  hasUnsavedEdits: boolean
}

export function classifyConflict({
  diskHash,
  knownHash,
  hasUnsavedEdits,
}: ConflictInput): ConflictVerdict {
  const diskChanged = diskHash !== knownHash
  if (!diskChanged) return hasUnsavedEdits ? 'local-pending' : 'in-sync'
  return hasUnsavedEdits ? 'conflict' : 'refresh'
}

export type ConflictResolution = 'keep-local' | 'take-disk' | 'save-both'

/**
 * Name for the copy written when the user keeps both sides.
 *
 * Carries the date so a note that conflicts repeatedly (a sync client on a
 * flaky connection) accumulates dated copies instead of overwriting the
 * previous rescue — the whole point of this branch is that nothing is lost.
 */
export function conflictCopyTitle(title: string, at: Date): string {
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, '0'),
    String(at.getDate()).padStart(2, '0'),
  ].join('-')
  const time = [
    String(at.getHours()).padStart(2, '0'),
    String(at.getMinutes()).padStart(2, '0'),
    String(at.getSeconds()).padStart(2, '0'),
  ].join('')
  return `${title} (conflicted copy ${stamp} ${time})`
}

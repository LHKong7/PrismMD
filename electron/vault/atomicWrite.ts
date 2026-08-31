/**
 * Crash-safe file writes.
 *
 * ★ `fs.writeFile` truncates the target and then streams into it. Lose power,
 * lose the process, or have the sync client read mid-write, and what is on
 * disk is *half a note* — with the other half gone for good. In a database
 * that window is a transaction; in a vault it is this file.
 *
 * The sequence is the standard one: write a sibling temp file, flush it to
 * the platter, then `rename` over the target. `rename` within a directory is
 * atomic on every filesystem PrismMD supports, so a reader sees either the
 * old note or the new one and never a torn one.
 *
 * The temp file is a *sibling*, not in the OS temp dir, for two reasons: a
 * cross-device rename is not atomic (and fails outright on Windows), and a
 * vault on an external disk would hit exactly that.
 */
import * as fs from 'fs'
import * as path from 'path'

/** Marks our temp files so the watcher and the scanner can skip them. */
export const TEMP_SUFFIX = '.prism-tmp'

export function isTempFile(filePath: string): boolean {
  return filePath.endsWith(TEMP_SUFFIX)
}

function tempPathFor(target: string): string {
  // The random component matters: two writes to the same note racing on one
  // temp name would interleave and produce exactly the torn file this avoids.
  const unique = `${process.pid.toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return path.join(path.dirname(target), `.${path.basename(target)}.${unique}${TEMP_SUFFIX}`)
}

export async function atomicWriteFile(
  target: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf-8',
): Promise<void> {
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  const temp = tempPathFor(target)

  let handle: fs.promises.FileHandle | null = null
  try {
    handle = await fs.promises.open(temp, 'w')
    await handle.writeFile(data, typeof data === 'string' ? encoding : undefined)
    // Without the flush the rename can land before the bytes do, and a crash
    // in between leaves a correctly-named, empty file — worse than a torn one,
    // because nothing about it looks wrong.
    await handle.sync()
    await handle.close()
    handle = null

    await fs.promises.rename(temp, target)
  } catch (err) {
    if (handle) await handle.close().catch(() => {})
    await fs.promises.rm(temp, { force: true }).catch(() => {})
    throw err
  }

  // Flushing the directory entry is what makes the *rename* durable, not just
  // the file contents. Not every platform allows opening a directory, so a
  // failure here is not fatal — the write itself already succeeded.
  await syncDirectory(path.dirname(target))
}

async function syncDirectory(dir: string): Promise<void> {
  let handle: fs.promises.FileHandle | null = null
  try {
    handle = await fs.promises.open(dir, 'r')
    await handle.sync()
  } catch {
    // Windows cannot fsync a directory handle; the rename is durable there by
    // other means. Not worth failing a successful write over.
  } finally {
    await handle?.close().catch(() => {})
  }
}

/**
 * Move a file, falling back to copy-then-delete when the destination is on
 * another device. Used by both `movePage` and the move into `.trash`.
 */
export async function movePath(from: string, to: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(to), { recursive: true })
  try {
    await fs.promises.rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await fs.promises.copyFile(from, to)
    await fs.promises.rm(from, { force: true })
  }
}

/** Remove leftover temp files, e.g. from a crash mid-write. */
export async function sweepTempFiles(dir: string): Promise<number> {
  let removed = 0
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      removed += await sweepTempFiles(full)
    } else if (isTempFile(entry.name)) {
      await fs.promises.rm(full, { force: true }).catch(() => {})
      removed++
    }
  }
  return removed
}

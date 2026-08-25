/**
 * The SQLite backend against the shared repository contract.
 *
 * ★ Running these at all requires faking `electron`, because `workspaceDb`
 * resolves its path from `app.getPath('userData')` at import time. That is
 * exactly the coupling the vault implementation is forbidden from repeating
 * (it takes its root by injection), and it is why `documentService` — which
 * this wraps — has had no test coverage until now despite being the module
 * that owns every note in the app.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// `vi.mock` factories are hoisted above the imports, so the temp dir has to be
// created in a hoisted block or the factory would close over an uninitialized
// binding.
const { DATA_DIR } = vi.hoisted(() => {
  const fs = require('fs') as typeof import('fs')
  const os = require('os') as typeof import('os')
  const path = require('path') as typeof import('path')
  return { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'prism-userdata-')) }
})

vi.mock('electron', () => ({
  app: { getPath: () => DATA_DIR, getName: () => 'PrismMD' },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {} },
  dialog: {},
  shell: {},
}))

import * as fs from 'fs'
import * as path from 'path'
import { describeNoteRepository } from './contract'
import { SqliteNoteRepository } from './sqliteNoteRepository'
import { closeDb } from '../services/workspaceDb'

/**
 * Each test gets an empty database. `workspace.db` lives at a path fixed at
 * module load, so isolation means closing the connection and deleting the
 * file rather than pointing at a new one.
 */
function resetDatabase(): void {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(path.join(DATA_DIR, `workspace.db${suffix}`), { force: true })
  }
}

beforeEach(resetDatabase)

afterEach(() => {
  closeDb()
})

describeNoteRepository('SqliteNoteRepository', {
  create: async () => new SqliteNoteRepository(),
})

it('starts each test from an empty workspace', () => {
  // Guards the harness itself: if isolation broke, every count assertion in
  // the contract above would drift instead of failing outright.
  expect(fs.existsSync(path.join(DATA_DIR, 'workspace.db'))).toBe(false)
})

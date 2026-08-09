/**
 * Regression test for the bug that made packaged builds launch with no window
 * and no error: `better-sqlite3` was marked `external` for the main bundle
 * (so `main.js` kept a bare `require`) but was missing from the packaging
 * whitelist (so the file never shipped). The require threw at the top of the
 * bundle and the whole main module failed to evaluate.
 *
 * Deriving both lists from `externals.ts` makes that unrepresentable; these
 * tests make sure nobody re-introduces a second hand-maintained list.
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { MAIN_EXTERNALS, PACKAGED_MODULE_SEEDS } from './externals'

const repoRoot = path.resolve(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')

describe('main-process externals', () => {
  it('ships every module the main bundle will require at runtime', () => {
    for (const mod of MAIN_EXTERNALS) {
      expect(PACKAGED_MODULE_SEEDS).toContain(mod)
    }
  })

  it('is installed, so packaging can actually copy it', () => {
    for (const mod of MAIN_EXTERNALS) {
      // fsevents is macOS-only and legitimately absent elsewhere.
      if (mod === 'fsevents' && process.platform !== 'darwin') continue
      expect(
        fs.existsSync(path.join(repoRoot, 'node_modules', mod, 'package.json')),
        `${mod} is declared external but not installed`,
      ).toBe(true)
    }
  })

  it('is the only source of the Vite external list', () => {
    // A literal array here would drift from the packaging whitelist again.
    const config = read('vite.main.config.ts')
    expect(config).toContain('MAIN_EXTERNALS')
    expect(config).not.toMatch(/external:\s*\[\s*['"]/)
  })

  it('is the only source of the packaging whitelist', () => {
    const config = read('forge.config.ts')
    expect(config).toContain('PACKAGED_MODULE_SEEDS')
    expect(config).not.toMatch(/const externalSeeds = \[\s*['"]/)
  })
})

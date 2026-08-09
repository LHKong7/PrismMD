/**
 * Main-process modules that are NOT bundled into `main.js`.
 *
 * This list has to be obeyed in two places that used to be maintained by
 * hand and drifted apart:
 *
 *  - `vite.main.config.ts` marks them `rollupOptions.external`, so the bundle
 *    keeps a bare `require('<pkg>')` instead of inlining the source.
 *  - `forge.config.ts` seeds its `ignore` whitelist from them, so the package
 *    actually ships the files that `require` will look for.
 *
 * When only the first half was updated, the app packaged cleanly and then
 * died on launch: `require('better-sqlite3')` at the top of `main.js` threw
 * MODULE_NOT_FOUND, the whole main module failed to evaluate, and Electron
 * sat there with zero windows and no error on stdout. Keeping one list is
 * what stops that from happening again — do not inline these anywhere.
 */

/** Why each module can't be bundled. */
export const MAIN_EXTERNALS = [
  /** Native .node binary (SQLite). Must be unpacked from the asar. */
  'better-sqlite3',
  /** Uses global BigInt, which Vite's bundling breaks. */
  'neo4j-driver',
  /** macOS-only native .node binary; optional dep of chokidar. */
  'fsevents',
] as const

/**
 * Extra packages the package must ship even though the bundler can inline
 * them — `chokidar` reaches `fsevents` through an optional require that
 * Rollup can't see.
 */
export const EXTRA_PACKAGED_MODULES = ['chokidar'] as const

/** Seeds for the transitive walk in `forge.config.ts`. */
export const PACKAGED_MODULE_SEEDS: readonly string[] = [
  ...MAIN_EXTERNALS,
  ...EXTRA_PACKAGED_MODULES,
]

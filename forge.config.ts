import type { ForgeConfig } from '@electron-forge/shared-types'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { PublisherGithub } from '@electron-forge/publisher-github'
import * as fs from 'fs'
import * as path from 'path'
import { appConfig } from './app.config'
import { resolveProfile } from './build-config/profiles'

/**
 * Electron Forge configuration.
 *
 * App identity (name, bundle id, icon, file associations, …) is shared
 * across every run. Anything that legitimately varies between
 * `npm run dev` and `npm run package` / `npm run make` is pulled from the
 * active build profile. See `build-config/profiles.ts`.
 */
const profile = resolveProfile()

// ---------------------------------------------------------------------------
// External node_modules — packages listed as `external` in vite.main.config.ts
// are NOT bundled into main.js, so they must exist on disk at runtime.
//
// The Forge Vite plugin's default `ignore` function strips everything except
// `.vite/`, which means `node_modules/` never reaches the asar (or unpacked).
// By providing our own `ignore` we whitelist these externals AND their full
// transitive dependency tree so they get copied into the package.
// ---------------------------------------------------------------------------
const externalSeeds = [
  '@insightgraph/sdk-embedded',
  '@insightgraph/core',
  '@insightgraph/agent-runtime',
  '@insightgraph/extractor',
  '@insightgraph/graph',
  '@insightgraph/parser',
  '@insightgraph/resolver',
  '@insightgraph/retriever',
  'neo4j-driver',
  'unpdf',
  'xlsx',
  'csv-parse',
  'yaml',
  'dotenv',
  'chokidar',
  'fsevents',
]

/**
 * Walk the full transitive dependency tree of seed modules by reading
 * each package.json's `dependencies` field. Runs once at config-load time.
 */
function collectAllDeps(seeds: string[]): Set<string> {
  const visited = new Set<string>()
  const queue = [...seeds]
  while (queue.length > 0) {
    const mod = queue.shift()!
    if (visited.has(mod)) continue
    visited.add(mod)
    try {
      const pkgPath = path.join('node_modules', mod, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      for (const dep of Object.keys(pkg.dependencies || {})) {
        if (!visited.has(dep)) queue.push(dep)
      }
    } catch {
      // Module not installed or no package.json — skip
    }
  }
  return visited
}

const allowedModules = collectAllDeps(externalSeeds)

// Collect scoped package prefixes (e.g. '@insightgraph', '@redis') that need
// their parent scope directory to be allowed through the ignore filter.
const allowedScopes = new Set<string>()
for (const mod of allowedModules) {
  if (mod.startsWith('@')) {
    const scope = mod.split('/')[0]
    allowedScopes.add(scope)
  }
}

// eslint-disable-next-line no-console
console.log(`[forge] ${allowedModules.size} external modules (from ${externalSeeds.length} seeds) will be included in package`)

/**
 * Custom ignore function that lets `.vite/` AND the external node_modules
 * (with full transitive deps) through the packager's copy filter.
 */
function packageIgnore(file: string): boolean {
  if (!file) return false
  // Always include Vite build output
  if (file.startsWith('/.vite')) return false
  // Always include package.json (needed by Electron)
  if (file === '/package.json') return false
  // Allow the node_modules directory itself (packager tests dirs before contents)
  if (file === '/node_modules') return false
  // Allow scoped package directories (e.g. /node_modules/@insightgraph)
  if (file.startsWith('/node_modules/@')) {
    const scope = file.slice('/node_modules/'.length)
    if (allowedScopes.has(scope)) return false
  }
  // Include whitelisted external node_modules and their transitive deps
  if (file.startsWith('/node_modules/')) {
    const rest = file.slice('/node_modules/'.length)
    // Extract the package name (handles scoped packages like @scope/pkg)
    let pkgName: string
    if (rest.startsWith('@')) {
      const parts = rest.split('/')
      pkgName = parts.slice(0, 2).join('/')
    } else {
      pkgName = rest.split('/')[0]
    }
    if (allowedModules.has(pkgName)) return false
  }
  // Ignore everything else
  return true
}

// Surface the active profile once at config-load so it's obvious which
// variant Forge is about to use.
// eslint-disable-next-line no-console
console.log(`[forge] active build profile: ${profile.name}`)

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: appConfig.appBundleId,
    name: appConfig.name,
    executableName: appConfig.executableName,
    ...(appConfig.icon ? { icon: appConfig.icon } : {}),
    // Custom ignore replaces the Vite plugin's default to whitelist external
    // node_modules. The plugin skips its own ignore when one is already set.
    ignore: packageIgnore,
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Markdown',
          CFBundleTypeRole: 'Viewer',
          LSItemContentTypes: ['net.daringfireball.markdown'],
          CFBundleTypeExtensions: ['md', 'markdown'],
        },
      ],
    },
    // Profile-specific overrides win over any shared defaults above.
    ...profile.packagerOverrides,
  },
  makers: profile.makers,
  outDir: profile.outDir,
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'lhkong7',
        name: 'prismmd',
      },
      draft: true,
      prerelease: false,
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'electron/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'electron/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
}

export default config

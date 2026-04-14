import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'

/**
 * External (third-party) plugin discovery and source reading.
 *
 * Layout we expect under `<userData>/plugins/<id>/`:
 *   manifest.json   — { id, name, version, main?, description? }
 *   <main>          — entry JS (defaults to `index.js`)
 *
 * The main process only loads *metadata* and *source bytes* — actual
 * evaluation happens in the renderer (`evalExternalPlugin`). That way
 * plugins run in the same JS context as the rest of the UI and can
 * import React / lucide-react, which the main process can't provide.
 */

export interface ExternalManifest {
  id: string
  name: string
  version: string
  description?: string
  main?: string
}

export interface ExternalPluginSource {
  manifest: ExternalManifest
  /** Raw source string of the plugin's entry file. */
  source: string
  /** Absolute directory, forwarded so error messages can reference it. */
  dir: string
}

function pluginsRoot(): string {
  return path.join(app.getPath('userData'), 'plugins')
}

/** Ensure the folder exists so users can drop plugins into it. */
async function ensureRoot(): Promise<string> {
  const root = pluginsRoot()
  await fs.mkdir(root, { recursive: true })
  return root
}

async function readManifest(pluginDir: string): Promise<ExternalManifest | null> {
  try {
    const raw = await fs.readFile(path.join(pluginDir, 'manifest.json'), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ExternalManifest>
    if (!parsed.id || !parsed.name || !parsed.version) return null
    return {
      id: parsed.id,
      name: parsed.name,
      version: parsed.version,
      description: parsed.description,
      main: parsed.main,
    }
  } catch {
    return null
  }
}

/**
 * Scan `<userData>/plugins/*` and return the payload for each plugin the
 * renderer can evaluate. Plugins with broken manifests are skipped
 * silently — we surface them in the UI via the `errors` field below.
 */
export async function discoverExternalPlugins(): Promise<{
  plugins: ExternalPluginSource[]
  errors: { dir: string; error: string }[]
}> {
  const root = await ensureRoot()

  let entries: string[]
  try {
    entries = await fs.readdir(root)
  } catch {
    return { plugins: [], errors: [] }
  }

  const plugins: ExternalPluginSource[] = []
  const errors: { dir: string; error: string }[] = []

  for (const entry of entries) {
    // Skip dotfiles / stray files at the top of the folder.
    if (entry.startsWith('.')) continue
    const pluginDir = path.join(root, entry)
    try {
      const stat = await fs.stat(pluginDir)
      if (!stat.isDirectory()) continue

      const manifest = await readManifest(pluginDir)
      if (!manifest) {
        errors.push({ dir: pluginDir, error: 'Missing or invalid manifest.json' })
        continue
      }

      const main = manifest.main ?? 'index.js'
      const entryPath = path.join(pluginDir, main)
      const source = await fs.readFile(entryPath, 'utf-8')

      plugins.push({ manifest, source, dir: pluginDir })
    } catch (err) {
      errors.push({
        dir: pluginDir,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { plugins, errors }
}

/** Used by the settings UI to let the user jump to the plugin folder. */
export function getPluginsDir(): string {
  return pluginsRoot()
}

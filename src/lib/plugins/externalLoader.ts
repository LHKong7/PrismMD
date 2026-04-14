import { activatePlugin, deactivatePlugin, usePluginManager } from './host'
import type { Plugin } from './types'

/**
 * Evaluates an external plugin's source in the renderer context.
 *
 * Security model for v1: **trust-based**, not sandboxed. Plugins run with
 * the same privileges as the rest of the app (renderer with contextIsolation
 * on — they can't touch Node APIs directly, but they can `fetch`, mutate
 * DOM, etc.). The settings UI shows a prominent "Plugins have full access
 * to your PrismMD session" warning and lets the user toggle the whole
 * external-plugin system off.
 *
 * CommonJS-style evaluation: we wrap the source in a function that takes
 * `module` / `exports` / `require` / `console` so most published plugins
 * (TypeScript compiled to CJS, rollup with `format: 'cjs'`) work as-is.
 * `require()` is intentionally *not* general — we whitelist a tiny set of
 * modules the plugin API needs (React, lucide-react) so plugins can't
 * pull in arbitrary Node modules.
 */

import * as React from 'react'
import * as LucideReact from 'lucide-react'

// A very small `require` shim. Expanding this list is the main knob
// for "what can plugins import".
const REQUIRE_ALIASES: Record<string, unknown> = {
  react: React,
  'lucide-react': LucideReact,
}

function pluginRequire(id: string): unknown {
  const mod = REQUIRE_ALIASES[id]
  if (!mod) {
    throw new Error(
      `Plugin require('${id}') is not whitelisted. Supported: ${Object.keys(REQUIRE_ALIASES).join(', ')}`,
    )
  }
  return mod
}

interface EvalResult {
  ok: true
  plugin: Plugin
}

interface EvalError {
  ok: false
  error: string
}

export function evalExternalPlugin(source: string, pluginDir: string): EvalResult | EvalError {
  try {
    const moduleObj: { exports: Record<string, unknown> } = { exports: {} }
    // `new Function` runs in the global scope — it can't close over our
    // module-private bindings, which keeps the plugin sandbox at least
    // partially honest (it can still reach `window.*` though).
    const fn = new Function(
      'module',
      'exports',
      'require',
      'console',
      source,
    ) as (
      module: typeof moduleObj,
      exports: typeof moduleObj.exports,
      require: (id: string) => unknown,
      console: Console,
    ) => void
    fn(moduleObj, moduleObj.exports, pluginRequire, console)

    // Plugins are expected to `export default <Plugin>` (which compiles
    // to `module.exports.default = <Plugin>` in CJS) OR set
    // `module.exports = <Plugin>` directly.
    const exported =
      (moduleObj.exports as { default?: Plugin }).default ??
      (moduleObj.exports as Plugin)

    if (!exported || typeof exported.activate !== 'function' || !exported.id) {
      return {
        ok: false,
        error: `Plugin at ${pluginDir} didn't export a valid Plugin object (expected { id, activate, … }).`,
      }
    }
    return { ok: true, plugin: exported }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

let bootstrapped = false

/**
 * Load every on-disk plugin. Safe to call once per app session; the guard
 * ensures we don't double-activate on HMR. Each plugin's load outcome
 * (ok / error) is recorded in the PluginManager store so the settings UI
 * can render a human-readable list.
 */
export async function bootstrapExternalPlugins(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true

  const res = await window.electronAPI.pluginsDiscover()
  if (!res.ok) {
    console.warn('[plugins] discovery failed:', res.error)
    return
  }

  for (const payload of res.plugins) {
    const evalRes = evalExternalPlugin(payload.source, payload.dir)
    if (!evalRes.ok) {
      // Stash a placeholder so the settings UI can show the user why
      // their plugin didn't start.
      usePluginManager.getState().setError(
        payload.manifest.id,
        {
          id: payload.manifest.id,
          name: payload.manifest.name,
          version: payload.manifest.version,
          description: payload.manifest.description,
          activate: () => {},
        },
        evalRes.error,
      )
      continue
    }
    await activatePlugin(evalRes.plugin)
  }

  // Non-fatal manifest read failures — keep them visible.
  for (const err of res.errors) {
    console.warn('[plugins] skipped', err.dir, '—', err.error)
  }
}

/** Exposed so the settings UI can hot-reload after the user drops a
 *  plugin into the folder. */
export async function reloadExternalPlugins(): Promise<void> {
  // Deactivate every plugin in the manager (built-in or external) that
  // doesn't come from our whitelist of built-ins. We don't have a
  // formal "is external" flag yet, so use the pluginId prefix convention
  // `prismmd.*` for built-ins.
  const loaded = usePluginManager.getState().loaded
  for (const id of Object.keys(loaded)) {
    if (!id.startsWith('prismmd.')) {
      await deactivatePlugin(id)
    }
  }
  bootstrapped = false
  await bootstrapExternalPlugins()
}

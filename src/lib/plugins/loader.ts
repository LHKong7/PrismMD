import { activatePlugin } from './host'
import type { Plugin } from './types'

// Built-in plugins. Added via static import so Vite can tree-shake and
// HMR works during dev. External (`<userData>/plugins/…`) loading lives
// in its own loader that speaks via IPC.
import helloPlugin from '../../plugins/hello'

const BUILTIN_PLUGINS: Plugin[] = [helloPlugin]

let bootstrapped = false

/**
 * Activates every built-in plugin once per renderer session. Safe to call
 * multiple times — HMR in dev will re-import this module and the guard
 * ensures we don't double-activate.
 */
export async function bootstrapBuiltinPlugins(): Promise<void> {
  if (bootstrapped) return
  bootstrapped = true
  for (const plugin of BUILTIN_PLUGINS) {
    await activatePlugin(plugin)
  }
}

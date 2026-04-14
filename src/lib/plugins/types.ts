import type { ComponentType, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Everything a plugin gets to poke at. Handed to the plugin's `activate`
 * function. The shape is deliberately small — we extend it as concrete
 * needs show up rather than speculating what plugins "might want".
 *
 * v1 surface: three registrars (command / sidebar panel / markdown
 * renderer). All registrations are reversible; the host tracks which
 * plugin owns which entry so deactivation can tear them down.
 */
export interface PluginHost {
  registerCommand(cmd: PluginCommand): void
  registerSidebarPanel(panel: PluginSidebarPanel): void
  registerMarkdownRenderer(renderer: PluginMarkdownRenderer): void
  /** Very small helper so plugins don't need their own toast lib yet. */
  notify(message: string, kind?: 'info' | 'success' | 'error'): void
}

export interface PluginCommand {
  /** Globally-unique id. Convention: `<pluginId>.<verb>`. */
  id: string
  /** Human-readable title shown in the command palette. */
  title: string
  /** Group heading in the palette; defaults to "plugins". */
  group?: string
  /** Optional icon — any lucide icon component works. */
  icon?: LucideIcon
  /** The action. Awaited if it returns a promise so errors propagate. */
  handler: () => void | Promise<void>
}

export interface PluginSidebarPanel {
  id: string
  title: string
  icon: LucideIcon
  /** v1 only supports the right sidebar. */
  side?: 'right'
  /** Plain React component; rendered as the panel body. */
  component: ComponentType
}

export interface PluginMarkdownRenderer {
  /** Lowercase language (matches ```<lang> in the source). */
  language: string
  component: ComponentType<{ code: string }>
}

export interface Plugin {
  id: string
  name: string
  version: string
  /** Optional one-liner shown in the Plugins settings list. */
  description?: string
  activate(host: PluginHost): void | Promise<void>
  /** Called when the plugin is disabled or the app shuts down. */
  deactivate?(): void | Promise<void>
}

/**
 * Wire format the main process ships to the renderer for external
 * (on-disk) plugins. The renderer evaluates `source` via `new Function`
 * and pulls `module.exports.default` out to get the `Plugin` object.
 */
export interface ExternalPluginPayload {
  manifest: {
    id: string
    name: string
    version: string
    description?: string
    main?: string
  }
  /** Raw JS source string. CommonJS-style — see `evalExternalPlugin`. */
  source: string
  /** Absolute directory the plugin was loaded from (for diagnostics). */
  dir: string
}

/** Used by the PluginHost's notify() — consumed by any subscribed UI. */
export type PluginNotification = {
  id: string
  message: string
  kind: 'info' | 'success' | 'error'
  at: number
}

export type { ReactNode }

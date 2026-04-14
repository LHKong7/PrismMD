import type { ComponentType } from 'react'

interface Entry {
  component: ComponentType<{ code: string }>
  pluginId: string
}

/**
 * Plain Map-backed registry for language-keyed markdown renderers. It's
 * not reactive — `CodeBlock` only needs a synchronous lookup per render
 * and plugin activation happens before user content is rendered.
 *
 * Kept outside zustand because zustand's subscriptions would force every
 * CodeBlock in the doc to re-render when a plugin activates, which is
 * both expensive and unnecessary: we just need the current snapshot.
 */
const registry = new Map<string, Entry>()

export function registerMarkdownRenderer(
  pluginId: string,
  language: string,
  component: ComponentType<{ code: string }>,
): void {
  registry.set(language.toLowerCase(), { component, pluginId })
}

export function unregisterMarkdownRenderersByPlugin(pluginId: string): void {
  for (const [lang, entry] of registry) {
    if (entry.pluginId === pluginId) registry.delete(lang)
  }
}

export function lookupMarkdownRenderer(
  language: string,
): ComponentType<{ code: string }> | null {
  const entry = registry.get(language.toLowerCase())
  return entry?.component ?? null
}

/** For settings / debug UI — snapshot of what's registered. */
export function listMarkdownRenderers(): { language: string; pluginId: string }[] {
  return Array.from(registry.entries()).map(([language, { pluginId }]) => ({
    language,
    pluginId,
  }))
}

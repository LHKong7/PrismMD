import { MermaidBlock } from '../../components/reader/components/MermaidBlock'
import type { Plugin } from '../../lib/plugins/types'

/**
 * Mermaid diagram rendering, repackaged as a plugin.
 *
 * It used to live as a hard-coded `if (language === 'mermaid')` branch
 * inside `CodeBlock`. Wrapping it as a plugin serves two purposes:
 *   1. It's the canonical example of `registerMarkdownRenderer` — any
 *      third-party plugin for a diagramming library (plantuml, d2, …)
 *      can copy this file almost verbatim.
 *   2. Mermaid pulls in a 1 MB+ bundle; making it a plugin means we can
 *      later add a user toggle to skip loading it entirely.
 */
const mermaidPlugin: Plugin = {
  id: 'prismmd.mermaid',
  name: 'Mermaid Diagrams',
  version: '0.1.0',
  description: 'Renders ```mermaid code blocks as interactive diagrams.',

  activate(host) {
    host.registerMarkdownRenderer({
      language: 'mermaid',
      component: MermaidBlock,
    })
  },
}

export default mermaidPlugin

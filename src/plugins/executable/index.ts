import { ExecutableBlock } from '../../components/reader/components/ExecutableBlock'
import type { Plugin } from '../../lib/plugins/types'

/**
 * Executable code blocks — notebook-style code execution in markdown.
 *
 * Use the `:run` suffix on a fenced code block's language tag to make
 * it executable:
 *
 *   ```python:run
 *   print("Hello, world!")
 *   ```
 *
 * For JS/HTML/CSS: runs in a sandboxed iframe.
 * For Python and other languages: sends to the AI Agent for execution,
 * returning structured results (stdout, tables, charts).
 */
const executablePlugin: Plugin = {
  id: 'prismmd.executable',
  name: 'Executable Code Blocks',
  version: '0.1.0',
  description: 'Run code blocks with the :run suffix and display results inline.',

  activate(host) {
    const languages = [
      'python:run',
      'js:run',
      'javascript:run',
      'html:run',
      'css:run',
      'sql:run',
      'ruby:run',
      'go:run',
      'rust:run',
      'java:run',
      'c:run',
      'cpp:run',
      'shell:run',
      'bash:run',
    ]

    for (const lang of languages) {
      host.registerMarkdownRenderer({
        language: lang,
        component: ExecutableBlock,
      })
    }
  },
}

export default executablePlugin

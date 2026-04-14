import { Sparkles } from 'lucide-react'
import type { Plugin } from '../../lib/plugins/types'

/**
 * Minimal sample plugin that proves the three extension points on the
 * PluginHost surface. Ships bundled with PrismMD so users can see a
 * live example of what a plugin looks like before installing external
 * ones.
 *
 * It registers a single command "Say hello" in the command palette
 * that emits a transient notification via `host.notify`.
 */
const hello: Plugin = {
  id: 'prismmd.hello',
  name: 'Hello Plugin',
  version: '0.1.0',
  description: 'Minimal example — registers a "Say hello" command.',

  activate(host) {
    host.registerCommand({
      id: 'prismmd.hello.sayHello',
      title: 'Plugin: Say hello',
      group: 'Plugins',
      icon: Sparkles,
      handler: () => {
        host.notify('Hello from the Hello Plugin 👋', 'success')
      },
    })
  },
}

export default hello

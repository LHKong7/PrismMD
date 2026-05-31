import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  build: {
    rollupOptions: {
      // Modules listed here are NOT bundled into main.js — they stay as bare
      // require() calls and must exist on disk at runtime.
      //
      // Why each module is external:
      //   • fsevents — macOS-only native .node binary
      //   • neo4j-driver — uses global BigInt which breaks when bundled by Vite
      external: [
        'fsevents',
        'neo4j-driver',
      ],
    },
  },
  worker: {
    format: 'es',
  },
})

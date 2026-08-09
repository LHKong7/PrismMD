import { defineConfig } from 'vite'
import { MAIN_EXTERNALS } from './build-config/externals'

export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  build: {
    rollupOptions: {
      // Modules listed here are NOT bundled into main.js — they stay as bare
      // require() calls and must exist on disk at runtime, which is why the
      // same list also seeds forge.config.ts's packaging whitelist.
      external: [...MAIN_EXTERNALS],
    },
  },
  worker: {
    format: 'es',
  },
})

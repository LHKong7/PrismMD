import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    conditions: ['node'],
  },
  build: {
    rollupOptions: {
      // fsevents is a macOS-only native optional dep of chokidar.
      // Keep it external so Vite doesn't try to bundle the native .node binary;
      // chokidar falls back to polling if fsevents isn't available.
      external: ['fsevents'],
    },
  },
})

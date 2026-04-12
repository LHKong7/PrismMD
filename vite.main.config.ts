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
      //
      // The InsightGraph embedded SDK and its peers pull in Node-only deps
      // (neo4j-driver with native sockets, PDF/spreadsheet parsers, etc.) that
      // must not be bundled into the main-process chunk.
      external: [
        'fsevents',
        '@insightgraph/sdk-embedded',
        '@insightgraph/core',
        '@insightgraph/agent-runtime',
        '@insightgraph/extractor',
        '@insightgraph/graph',
        '@insightgraph/parser',
        '@insightgraph/resolver',
        '@insightgraph/retriever',
        'neo4j-driver',
        'unpdf',
        'xlsx',
        'csv-parse',
        'yaml',
        'dotenv',
      ],
    },
  },
})

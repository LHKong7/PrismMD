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
      // IMPORTANT: Every module here MUST also appear in the `asar.unpack`
      // glob in build-config/profiles.ts, otherwise require() fails inside
      // the packaged app because asar doesn't support normal CJS resolution.
      //
      // Why each module is external:
      //   • fsevents — macOS-only native .node binary
      //   • borderless-agent — optional peer dep @aws-sdk/client-s3 not installed
      //   • neo4j-driver — uses global BigInt which breaks when bundled by Vite
      //   • @insightgraph/* — depend on neo4j-driver transitively
      //   • unpdf, xlsx, csv-parse, yaml, dotenv — heavy deps of @insightgraph/*
      external: [
        'fsevents',
        'borderless-agent',
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

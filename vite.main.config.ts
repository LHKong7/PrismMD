import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    conditions: ['node'],
    alias: {
      // borderless-agent's cloudBackend.js has a top-level static import of
      // @aws-sdk/client-s3 which isn't installed (optional peer dep). Since
      // cloud storage is never used, alias it to an empty stub so the bundled
      // code doesn't crash at require() time.
      '@aws-sdk/client-s3': `${__dirname}/build-config/empty-module.js`,
    },
  },
  build: {
    rollupOptions: {
      // Modules listed here are NOT bundled into main.js — they stay as bare
      // require() calls and must exist on disk at runtime.
      //
      // IMPORTANT: Every module here MUST also appear in the `asar.unpack`
      // glob in build-config/profiles.ts and be whitelisted in the custom
      // `ignore` function in forge.config.ts.
      //
      // Why each module is external:
      //   • fsevents — macOS-only native .node binary
      //   • neo4j-driver — uses global BigInt which breaks when bundled by Vite
      //   • @insightgraph/* — depend on neo4j-driver transitively
      //   • unpdf, xlsx, csv-parse, yaml, dotenv — heavy deps of @insightgraph/*
      //
      // NOTE: borderless-agent is intentionally NOT external — it's ESM with
      // extensionless internal imports, which breaks both CJS require() and
      // ESM resolution in the packaged app. Bundling it works fine; its unused
      // @aws-sdk peer dep is aliased to an empty stub above.
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

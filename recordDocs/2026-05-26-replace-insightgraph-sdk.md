# Replace @insightgraph/sdk-embedded with Direct Neo4j + Internal AI

## Background / Context

Replaced the `@insightgraph/sdk-embedded` package and all 8 transitive `@insightgraph/*` packages with direct Neo4j Cypher queries and our internal AI service for entity extraction. This eliminates 80+ external modules from the package, simplifies the build, and gives full control over the knowledge graph pipeline.

## Design Decisions

- **Direct neo4j-driver**: All graph queries are now plain Cypher via `neo4j-driver` session.run(). The existing code already had Cypher fallback queries for most operations — we promoted them to primary.
- **AI entity extraction**: Document ingest uses `sendOneShot()` with a structured JSON schema to extract entities, relationships, claims, and events from document text. This replaces the SDK's LLM pipeline.
- **Simplified graph writing**: Entities created with `MERGE` (upsert by canonical_name), relationships with `MERGE`, claims and events with `CREATE`. Reports linked via `SOURCED_FROM`.
- **Graph query via AI**: `graphQuery()` now does keyword search in Neo4j → formats context → calls `sendOneShot()` → returns answer with numbered evidence.
- **Session management**: Simple in-memory UUID map instead of SDK's session infrastructure.

## Changes

### `electron/services/insightGraphService.ts` (rewritten)
- Removed all `@insightgraph/*` imports and monkey-patches
- Direct `neo4j-driver` connection via `withSession()` helper
- All read operations: Cypher queries returning normalized results
- Ingest: `sendOneShot()` extraction → Neo4j write
- Graph query: keyword Cypher search → AI answer
- Composite graph queries (global/ego/subgraph): direct Cypher with `ensureNode()` pattern
- Progress events emitted same as before (parsing → extracting → resolving → writing → completed)

### `vite.main.config.ts` (cleaned)
- Removed all `@insightgraph/*` from external list
- Removed `unpdf`, `xlsx`, `csv-parse`, `yaml`, `dotenv` (SDK-only deps)
- Only `fsevents` and `neo4j-driver` remain external

### `forge.config.ts` (cleaned)
- Removed all `@insightgraph/*` from externalSeeds
- External modules reduced from 80 (16 seeds) to 4 (3 seeds)

### `package.json`
- Removed `@insightgraph/sdk-embedded`

## Impact
- **Zero renderer changes**: All IPC channels, preload API, stores, and UI components unchanged
- **Package size**: 80+ external modules eliminated
- **Build output**: `4 external modules (from 3 seeds)` vs previous `80 external modules (from 16 seeds)`

## Verification

1. `npm run typecheck` — passes
2. `npm run dev` — builds without @insightgraph/*
3. Neo4j test connection works
4. Ingest: right-click file → "Save to Graph" → AI extracts → Neo4j populated
5. Graph view renders (Global/Document/Entity scopes)
6. Entity panel shows profile/claims/relationships/timeline
7. Contradiction banner works
8. Entity linking in reader highlights names

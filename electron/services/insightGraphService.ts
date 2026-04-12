import { app, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { InsightGraph } from '@insightgraph/sdk-embedded'
import neo4j from 'neo4j-driver'
import { getActiveProvider, getInsightGraphSettings, loadSettings, type InsightGraphSettings } from './settingsStore'

/**
 * LLM configuration supplied to InsightGraph. The SDK only understands
 * OpenAI-compatible endpoints, so Anthropic/Google providers are rejected
 * upstream (the user is told to switch providers for graph features).
 */
interface InsightGraphLlmConfig {
  model: string
  apiKey: string
  baseUrl?: string
}

interface BuiltConfig {
  settings: InsightGraphSettings
  llm: InsightGraphLlmConfig
  uploadDir: string
}

let current: { ig: InsightGraph; config: BuiltConfig } | null = null
let initPromise: Promise<InsightGraph> | null = null

export class InsightGraphConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InsightGraphConfigError'
  }
}

function resolveLlmConfig(): InsightGraphLlmConfig {
  const active = getActiveProvider()
  if (!active) {
    throw new InsightGraphConfigError(
      'No AI provider configured. Activate an OpenAI-compatible provider (OpenAI, Ollama, or Custom) in AI Settings first.',
    )
  }

  if (loadSettings().privacyMode && active.provider !== 'ollama') {
    throw new InsightGraphConfigError(
      'Privacy Mode is enabled. Only Ollama (local) can be used for Knowledge Graph operations.',
    )
  }

  switch (active.provider) {
    case 'openai':
      return {
        model: active.model,
        apiKey: active.apiKey,
        baseUrl: active.baseUrl ?? 'https://api.openai.com/v1',
      }
    case 'ollama': {
      const base = active.baseUrl ?? 'http://localhost:11434'
      return {
        model: active.model,
        apiKey: 'ollama',
        baseUrl: `${base.replace(/\/$/, '')}/v1`,
      }
    }
    case 'custom':
      if (!active.baseUrl) {
        throw new InsightGraphConfigError(
          'Custom provider is missing a base URL. Add one in AI Settings before using the Knowledge Graph.',
        )
      }
      return { model: active.model, apiKey: active.apiKey, baseUrl: active.baseUrl }
    case 'anthropic':
    case 'google':
    default:
      throw new InsightGraphConfigError(
        `Provider "${active.provider}" is not OpenAI-compatible. Switch to OpenAI, Ollama, or Custom in AI Settings to use the Knowledge Graph.`,
      )
  }
}

function resolveUploadDir(): string {
  return path.join(app.getPath('userData'), 'insightgraph', 'uploads')
}

function sameConfig(a: BuiltConfig, b: BuiltConfig): boolean {
  return (
    a.settings.neo4j.uri === b.settings.neo4j.uri &&
    a.settings.neo4j.user === b.settings.neo4j.user &&
    a.settings.neo4j.password === b.settings.neo4j.password &&
    a.settings.domain === b.settings.domain &&
    a.llm.model === b.llm.model &&
    a.llm.apiKey === b.llm.apiKey &&
    a.llm.baseUrl === b.llm.baseUrl &&
    a.uploadDir === b.uploadDir
  )
}

async function buildConfig(): Promise<BuiltConfig> {
  const settings = getInsightGraphSettings()
  if (!settings.enabled) {
    throw new InsightGraphConfigError('Knowledge Graph is disabled in Settings.')
  }
  if (!settings.neo4j.uri || !settings.neo4j.user) {
    throw new InsightGraphConfigError('Neo4j URI and username are required.')
  }
  const llm = resolveLlmConfig()
  const uploadDir = resolveUploadDir()
  await fs.mkdir(uploadDir, { recursive: true })
  return { settings, llm, uploadDir }
}

/**
 * Lazily resolve an initialized InsightGraph instance. Rebuilds and closes
 * the previous instance when the underlying config (Neo4j, LLM, domain)
 * changes so user edits in Settings take effect immediately.
 */
export async function getInstance(win?: BrowserWindow | null): Promise<InsightGraph> {
  const config = await buildConfig()

  if (current && !sameConfig(current.config, config)) {
    try {
      await current.ig.close()
    } catch {
      // best-effort close
    }
    current = null
    initPromise = null
  }

  if (current) return current.ig

  if (!initPromise) {
    initPromise = (async () => {
      const ig = new InsightGraph({
        neo4j: {
          uri: config.settings.neo4j.uri,
          user: config.settings.neo4j.user,
          password: config.settings.neo4j.password,
        },
        llm: config.llm,
        domain: config.settings.domain,
        uploadDir: config.uploadDir,
      })

      ig.on('progress', (ev: unknown) => {
        const mw = win ?? BrowserWindow.getAllWindows()[0]
        if (mw && !mw.isDestroyed()) {
          mw.webContents.send('insightgraph:progress', ev)
        }
      })

      await ig.initialize()
      current = { ig, config }
      return ig
    })().catch((err) => {
      initPromise = null
      throw err
    })
  }

  return initPromise
}

export async function testNeo4jConnection(
  uri: string,
  user: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!uri) return { ok: false, error: 'Neo4j URI is required.' }
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password))
  try {
    await driver.verifyConnectivity()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await driver.close().catch(() => {})
  }
}

export async function ingestDocument(
  filePath: string,
  win?: BrowserWindow | null,
): Promise<Record<string, unknown>> {
  if (!filePath) throw new InsightGraphConfigError('No file path provided.')
  await fs.access(filePath)
  const ig = await getInstance(win)
  const result = await ig.ingest({ filePath })
  return result as unknown as Record<string, unknown>
}

export async function graphQuery(
  question: string,
  sessionId?: string,
): Promise<Record<string, unknown>> {
  const ig = await getInstance()
  const result = await ig.agentQuery(question, sessionId)
  return result as unknown as Record<string, unknown>
}

export async function listReports(): Promise<Record<string, unknown>[]> {
  const ig = await getInstance()
  return ig.listReports()
}

export function createSession(): Promise<string> {
  return getInstance().then((ig) => ig.createSession())
}

export async function shutdown(): Promise<void> {
  if (current) {
    try {
      await current.ig.close()
    } catch {
      // ignore
    }
    current = null
    initPromise = null
  }
}

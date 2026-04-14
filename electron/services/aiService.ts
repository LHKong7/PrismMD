import { AgentBuilder } from 'borderless-agent'
import type { AgentInstance, LLMConfig } from 'borderless-agent'
import { BrowserWindow } from 'electron'
import { getActiveProvider, loadSettings } from './settingsStore'
import { callTool as callMcpTool, discoverAll as discoverAllMcpTools } from './mcpService'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface SendMessageRequest {
  messages: ChatMessage[]
  documentContext?: string
  memoryContext?: string
  graphContext?: string
}

let currentAbortController: AbortController | null = null

export function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

/**
 * Register discovered MCP tools on the agent builder.
 *
 * `borderless-agent`'s exact tool-registration API isn't documented in the
 * dependency we have at build time, so we probe a couple of common fluent
 * method names (`addTool`, `registerTool`, `withTool`) and fall back to
 * logging a warning if none match. A failure here never blocks chat —
 * the agent just runs without the extra tools.
 *
 * Tool names are prefixed `<serverId>__<toolName>` so two MCP servers
 * exposing the same name (both "search", for example) don't collide.
 */
async function attachMcpTools(builder: AgentBuilder): Promise<number> {
  let attached = 0
  let discovered: Awaited<ReturnType<typeof discoverAllMcpTools>> = []
  try {
    discovered = await discoverAllMcpTools()
  } catch (err) {
    console.warn('[mcp] tool discovery failed:', err)
    return 0
  }
  if (discovered.length === 0) return 0

  type LooseBuilder = AgentBuilder & Record<string, unknown>
  const loose = builder as LooseBuilder

  // Pick the first available tool-registration method. Recorded here
  // (rather than inline-cast at each call site) so the fallback branch
  // can log one clear warning.
  const registrar =
    (typeof loose.addTool === 'function' && 'addTool') ||
    (typeof loose.registerTool === 'function' && 'registerTool') ||
    (typeof loose.withTool === 'function' && 'withTool') ||
    null
  if (!registrar) {
    console.warn(
      '[mcp] borderless-agent exposes no addTool/registerTool/withTool; ' +
        `skipping ${discovered.length} MCP tool(s). Tool use will resume ` +
        "once the agent's tool API is wired.",
    )
    return 0
  }

  for (const { serverId, tool, qualifiedName } of discovered) {
    try {
      // The shape passed below is the most common one across agent
      // libraries (description + JSON-Schema inputs + async execute).
      // If `borderless-agent` accepts slightly different keys, fix in
      // one place (here).
      ;(loose[registrar] as (t: unknown) => void)({
        name: qualifiedName,
        description: tool.description ?? `MCP tool from server "${serverId}"`,
        inputSchema: tool.inputSchema,
        parameters: tool.inputSchema, // alias some libraries prefer
        execute: async (args: Record<string, unknown>) =>
          callMcpTool(serverId, tool.name, args ?? {}),
      })
      attached += 1
    } catch (err) {
      console.warn(`[mcp] failed to register tool "${qualifiedName}":`, err)
    }
  }
  return attached
}

/**
 * Build an AgentInstance from borderless-agent using the active provider config.
 *
 * When MCP is enabled in settings, `attachMcpTools` registers every
 * discovered tool before `build()` — this lifts the previous
 * `setMaxToolRounds(1)` cap to a larger budget so the model has room
 * for multi-step tool use (fetch → summarise → cite, for example).
 */
async function buildAgent(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
  systemPrompt?: string,
  maxToolRounds: number = 1,
  attachTools: boolean = true,
): Promise<AgentInstance> {
  const llmConfig: LLMConfig = { apiKey, model }

  // Ollama uses an OpenAI-compatible endpoint at /v1
  if (provider === 'ollama') {
    llmConfig.baseUrl = `${baseUrl ?? 'http://localhost:11434'}/v1`
    llmConfig.apiKey = 'ollama'
  } else if (provider === 'anthropic') {
    llmConfig.baseUrl = 'https://api.anthropic.com/v1'
  } else if (provider === 'google') {
    llmConfig.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai'
  } else if (baseUrl) {
    llmConfig.baseUrl = baseUrl
  }

  const settings = loadSettings()
  const mcpEnabled = settings.mcp.enabled && attachTools

  const builder = new AgentBuilder()
    .setLLM(llmConfig)
    .setIncludeBuiltinTools(false)
    .enableStreaming()
    .enableContext()
    // When MCP is enabled, give the model headroom for a few tool rounds
    // regardless of the caller's request. Without tools we honour the
    // caller's intent (1 for streaming chat, higher for structured
    // one-shot calls).
    .setMaxToolRounds(mcpEnabled ? Math.max(maxToolRounds, 5) : maxToolRounds)

  if (systemPrompt) {
    builder.setSystemPrompt(systemPrompt)
  }

  if (mcpEnabled) {
    const attached = await attachMcpTools(builder)
    if (attached > 0) {
      // Nudge the model to actually use them — some models otherwise
      // ignore tools unless told they exist.
      builder.setSystemPrompt(
        [
          systemPrompt ?? '',
          '',
          `You have access to ${attached} MCP tool(s). Call them when ` +
            'the user asks for information you don\'t already have in the ' +
            'provided context.',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }
  }

  return builder.build()
}

export async function sendMessage(
  mainWindow: BrowserWindow,
  request: SendMessageRequest
): Promise<{ provider: string; model: string }> {
  const settings = loadSettings()

  const active = getActiveProvider()
  if (!active) {
    throw new Error('No AI provider configured. Please set up an API key in Settings.')
  }

  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model, apiKey, baseUrl } = active

  // Build system prompt with document, RAG, and memory context
  const systemParts: string[] = [
    'You are an intelligent reading assistant for PrismMD, a Markdown reader.',
  ]

  if (request.memoryContext) {
    systemParts.push(`\n## Previous Knowledge\n${request.memoryContext}`)
  }

  if (request.documentContext) {
    systemParts.push(`\n## Current Document\n${request.documentContext}`)
  }

  if (request.graphContext) {
    systemParts.push(`\n## Knowledge Graph Insights\n${request.graphContext}`)
    // Explicit citation instruction — the renderer parses these exact
    // `[N]` markers to render interactive superscripts.
    systemParts.push(
      '\nWhenever you use information from the Knowledge Graph Insights section, ' +
        'cite it inline with the matching bracketed number(s), e.g. ' +
        '"revenue grew 30% year over year [2]". Cite each claim at most once, ' +
        'right after the sentence it supports, and never invent citation numbers ' +
        'that were not listed in the Evidence block.',
    )
  }

  systemParts.push('\nAnswer the user\'s questions based on the context above.')

  const systemPrompt = systemParts.join('\n')

  // Build conversation history for borderless-agent
  const history = request.messages.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const lastMessage = request.messages[request.messages.length - 1]
  if (!lastMessage) {
    throw new Error('No messages provided.')
  }

  // Build agent with the active provider
  const agent = await buildAgent(provider, apiKey, model, baseUrl, systemPrompt)

  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  try {
    const stream = agent.stream(lastMessage.content, history)

    for await (const chunk of stream) {
      if (signal.aborted) break
      if (chunk.delta) {
        mainWindow.webContents.send('agent:stream-chunk', chunk.delta)
      }
    }
  } finally {
    currentAbortController = null
    await agent.close()
  }

  return { provider, model }
}

/**
 * Non-streaming, single-turn AI call with optional structured JSON output.
 *
 * Reuses the active provider from Settings and `buildAgent()` so we don't
 * maintain a second LLM pipeline. Used by selection AI actions (explain,
 * translate, …), doc TL;DRs, quiz generation — anywhere the caller wants
 * a synchronous answer instead of a streamed chat.
 *
 * When `jsonSchema` is provided, the caller expects the reply to be JSON
 * matching that shape. We append a strict system suffix asking for raw JSON
 * and then try hard to parse it (stripping ```json fences that some
 * providers still emit). On parse failure we surface a descriptive error
 * rather than returning malformed data.
 */
export async function sendOneShot(request: {
  prompt: string
  systemPrompt?: string
  /**
   * Optional JSON Schema-ish hint. We don't fully validate against it — we
   * just embed it in the system prompt so the model formats the reply
   * predictably, then `JSON.parse` the result.
   */
  jsonSchema?: Record<string, unknown>
}): Promise<{ provider: string; model: string; reply: string; json?: unknown }> {
  const settings = loadSettings()
  const active = getActiveProvider()
  if (!active) {
    throw new Error('No AI provider configured. Please set up an API key in Settings.')
  }
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model, apiKey, baseUrl } = active

  const systemParts: string[] = []
  if (request.systemPrompt) systemParts.push(request.systemPrompt)
  if (request.jsonSchema) {
    systemParts.push(
      [
        'You MUST respond with a single valid JSON value and nothing else.',
        'Do not wrap the JSON in Markdown code fences. Do not add commentary.',
        'The response must conform to this shape:',
        JSON.stringify(request.jsonSchema, null, 2),
      ].join('\n'),
    )
  }
  const systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined

  // Give one-shot calls a larger tool-round budget than streaming chat so
  // the agent has room to produce a final answer (streaming chat never
  // triggers tools; one-shot with a JSON schema occasionally spends a
  // round before emitting the final reply).
  const agent = await buildAgent(provider, apiKey, model, baseUrl, systemPrompt, 8)
  try {
    const result = await agent.chat(request.prompt)
    const reply = result.reply ?? ''

    // borderless-agent returns this sentinel string when it gives up before
    // the model produced a usable reply. Surface it as a typed error instead
    // of letting the caller choke on JSON.parse.
    if (reply.startsWith('Stopped:')) {
      throw new Error(reply.trim())
    }

    let json: unknown | undefined
    if (request.jsonSchema) {
      const stripped = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
      try {
        json = JSON.parse(stripped)
      } catch (err) {
        throw new Error(
          `Expected JSON reply but failed to parse: ${
            err instanceof Error ? err.message : String(err)
          }. Raw reply: ${reply.slice(0, 200)}`,
        )
      }
    }

    return { provider, model, reply, json }
  } finally {
    await agent.close()
  }
}

export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<boolean> {
  try {
    const model = provider === 'ollama' ? 'llama3' : provider === 'anthropic' ? 'claude-haiku-4-20250414' : provider === 'google' ? 'gemini-1.5-flash' : 'gpt-4o-mini'

    // Connection test — skip MCP tool attach so a broken server can't
    // block the test handshake.
    const agent = await buildAgent(provider, apiKey, model, baseUrl, undefined, 1, false)

    const result = await agent.chat('hi')
    await agent.close()

    return !!result.reply
  } catch {
    return false
  }
}

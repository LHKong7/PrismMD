/**
 * AI Service — thin wrapper over Anthropic and OpenAI SDKs.
 *
 * Replaces the former borderless-agent dependency with direct SDK calls.
 * Two code paths: Anthropic (native SDK) and OpenAI-compatible (covers
 * OpenAI, Ollama, Google, and custom endpoints).
 *
 * Exports the same four functions the IPC handlers expect:
 *   sendMessage()   — streaming chat
 *   sendOneShot()   — non-streaming single-turn
 *   testConnection() — quick connectivity test
 *   stopGeneration() — abort in-flight stream
 */
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { BrowserWindow } from 'electron'
import { getActiveProvider, loadSettings } from './settingsStore'
import { callTool as callMcpTool, discoverAll as discoverAllMcpTools } from './mcpService'

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

// ─── Abort ──────────────────────────────────────────────────────────────────

let currentAbortController: AbortController | null = null

export function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v) },
      (err) => { signal.removeEventListener('abort', onAbort); reject(err) },
    )
  })
}

// ─── MCP Tool Discovery ────────────────────────────────────────────────────

async function discoverMcpTools(): Promise<{ tools: McpTool[]; warning?: string }> {
  const settings = loadSettings()
  if (!settings.mcp.enabled) return { tools: [] }

  let discovered: Awaited<ReturnType<typeof discoverAllMcpTools>> = []
  try {
    discovered = await discoverAllMcpTools()
  } catch (err) {
    return {
      tools: [],
      warning: `MCP tool discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (discovered.length === 0) return { tools: [] }

  const tools: McpTool[] = discovered.map(({ serverId, tool, qualifiedName }) => ({
    name: qualifiedName,
    description: tool.description ?? `MCP tool from server "${serverId}"`,
    inputSchema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    execute: async (args: Record<string, unknown>) => callMcpTool(serverId, tool.name, args ?? {}),
  }))

  return { tools }
}

// ─── Provider Helpers ───────────────────────────────────────────────────────

function resolveBaseUrl(provider: string, baseUrl?: string): string {
  if (provider === 'ollama') return `${baseUrl ?? 'http://localhost:11434'}/v1`
  if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai'
  if (baseUrl) return baseUrl
  return 'https://api.openai.com/v1'
}

function resolveApiKey(provider: string, apiKey: string): string {
  return provider === 'ollama' ? 'ollama' : apiKey
}

// ─── Anthropic Streaming ────────────────────────────────────────────────────

async function streamAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  signal: AbortSignal,
  onChunk: (delta: string) => void,
): Promise<void> {
  const client = new Anthropic({ apiKey })

  const messages = [
    ...history.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ]

  const stream = client.messages.stream({
    model,
    system: systemPrompt,
    messages,
    max_tokens: 4096,
  })

  for await (const event of stream) {
    if (signal.aborted) break
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      onChunk(event.delta.text)
    }
  }
}

// ─── OpenAI-Compatible Streaming ────────────────────────────────────────────

async function streamOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  signal: AbortSignal,
  onChunk: (delta: string) => void,
): Promise<void> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl })

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content } as OpenAI.ChatCompletionMessageParam)),
    { role: 'user', content: userMessage },
  ]

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
  })

  for await (const chunk of stream) {
    if (signal.aborted) break
    const delta = chunk.choices[0]?.delta?.content
    if (delta) onChunk(delta)
  }
}

// ─── Anthropic One-Shot ─────────────────────────────────────────────────────

async function chatAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  prompt: string,
  tools: McpTool[],
  maxToolRounds: number,
): Promise<string> {
  const client = new Anthropic({ apiKey })

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  // Tool definitions for Anthropic format
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }))

  let rounds = 0
  while (rounds < maxToolRounds) {
    rounds++

    const params: Anthropic.MessageCreateParams = {
      model,
      messages,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    }

    const response = await client.messages.create(params)

    // Check for tool use
    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use')
    const textBlocks = response.content.filter((b) => b.type === 'text')

    if (toolUseBlocks.length === 0 || rounds >= maxToolRounds) {
      // No tool calls or max rounds reached — return text
      return textBlocks.map((b) => b.type === 'text' ? b.text : '').join('')
    }

    // Execute tool calls
    messages.push({ role: 'assistant', content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of toolUseBlocks) {
      if (block.type !== 'tool_use') continue
      const tool = tools.find((t) => t.name === block.name)
      let result: string
      try {
        const output = await (tool?.execute(block.input as Record<string, unknown>) ?? Promise.resolve('Tool not found'))
        result = typeof output === 'string' ? output : JSON.stringify(output)
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
    }

    messages.push({ role: 'user', content: toolResults })
  }

  return ''
}

// ─── OpenAI-Compatible One-Shot ─────────────────────────────────────────────

async function chatOpenAI(
  apiKey: string,
  baseUrl: string,
  model: string,
  systemPrompt: string | undefined,
  prompt: string,
  tools: McpTool[],
  maxToolRounds: number,
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL: baseUrl })

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]

  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))

  let rounds = 0
  while (rounds < maxToolRounds) {
    rounds++

    const params: OpenAI.ChatCompletionCreateParams = {
      model,
      messages,
      ...(openaiTools.length > 0 ? { tools: openaiTools } : {}),
    }

    const response = await client.chat.completions.create(params)
    const choice = response.choices[0]
    if (!choice) return ''

    const msg = choice.message

    if (!msg.tool_calls || msg.tool_calls.length === 0 || rounds >= maxToolRounds) {
      return msg.content ?? ''
    }

    // Execute tool calls
    messages.push(msg)

    for (const call of msg.tool_calls) {
      const tool = tools.find((t) => t.name === call.function.name)
      let result: string
      try {
        const args = JSON.parse(call.function.arguments || '{}')
        const output = await (tool?.execute(args) ?? Promise.resolve('Tool not found'))
        result = typeof output === 'string' ? output : JSON.stringify(output)
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
    }
  }

  return ''
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function sendMessage(
  mainWindow: BrowserWindow,
  request: SendMessageRequest,
): Promise<{ provider: string; model: string }> {
  const settings = loadSettings()
  const active = getActiveProvider()
  if (!active) throw new Error('No AI provider configured. Please set up an API key in Settings.')
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model, apiKey, baseUrl } = active

  // Build system prompt
  const systemParts: string[] = [
    'You are an intelligent reading assistant for PrismMD, a Markdown reader.',
  ]
  if (request.memoryContext) systemParts.push(`\n## Previous Knowledge\n${request.memoryContext}`)
  if (request.documentContext) systemParts.push(`\n## Current Document\n${request.documentContext}`)
  if (request.graphContext) {
    systemParts.push(`\n## Knowledge Graph Insights\n${request.graphContext}`)
    systemParts.push(
      '\nWhenever you use information from the Knowledge Graph Insights section, ' +
      'cite it inline with the matching bracketed number(s), e.g. ' +
      '"revenue grew 30% year over year [2]". Cite each claim at most once, ' +
      'right after the sentence it supports, and never invent citation numbers ' +
      'that were not listed in the Evidence block.',
    )
  }
  systemParts.push('\nAnswer the user\'s questions based on the context above.')

  // MCP tool hint
  const { tools: mcpTools, warning: mcpWarning } = await discoverMcpTools()
  if (mcpTools.length > 0) {
    systemParts.push(
      `\nYou have access to ${mcpTools.length} MCP tool(s). Call them when ` +
      "the user asks for information you don't already have in the provided context.",
    )
  }
  if (mcpWarning) mainWindow.webContents.send('agent:mcp-warning', mcpWarning)

  const systemPrompt = systemParts.join('\n')

  const history = request.messages.slice(0, -1)
  const lastMessage = request.messages[request.messages.length - 1]
  if (!lastMessage) throw new Error('No messages provided.')

  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  try {
    const onChunk = (delta: string) => {
      mainWindow.webContents.send('agent:stream-chunk', delta)
    }

    if (provider === 'anthropic') {
      await streamAnthropic(apiKey, model, systemPrompt, history, lastMessage.content, signal, onChunk)
    } else {
      const resolvedBaseUrl = resolveBaseUrl(provider, baseUrl)
      const resolvedKey = resolveApiKey(provider, apiKey)
      await streamOpenAI(resolvedKey, resolvedBaseUrl, model, systemPrompt, history, lastMessage.content, signal, onChunk)
    }
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      // User cancelled — not an error
    } else {
      const message = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('agent:stream-error', message)
    }
  } finally {
    currentAbortController = null
  }

  return { provider, model }
}

export async function sendOneShot(request: {
  prompt: string
  systemPrompt?: string
  jsonSchema?: Record<string, unknown>
}): Promise<{ provider: string; model: string; reply: string; json?: unknown }> {
  const settings = loadSettings()
  const active = getActiveProvider()
  if (!active) throw new Error('No AI provider configured. Please set up an API key in Settings.')
  if (settings.privacyMode && active.provider !== 'ollama') {
    throw new Error('Privacy Mode is enabled. Only local models (Ollama) are allowed.')
  }

  const { provider, model, apiKey, baseUrl } = active

  const systemParts: string[] = []
  if (request.systemPrompt) systemParts.push(request.systemPrompt)
  if (request.jsonSchema) {
    systemParts.push([
      'You MUST respond with a single valid JSON value and nothing else.',
      'Do not wrap the JSON in Markdown code fences. Do not add commentary.',
      'The response must conform to this shape:',
      JSON.stringify(request.jsonSchema, null, 2),
    ].join('\n'))
  }
  const systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined

  // Discover MCP tools for one-shot calls
  const { tools: mcpTools } = await discoverMcpTools()

  let reply: string
  if (provider === 'anthropic') {
    reply = await chatAnthropic(apiKey, model, systemPrompt, request.prompt, mcpTools, 8)
  } else {
    const resolvedBaseUrl = resolveBaseUrl(provider, baseUrl)
    const resolvedKey = resolveApiKey(provider, apiKey)
    reply = await chatOpenAI(resolvedKey, resolvedBaseUrl, model, systemPrompt, request.prompt, mcpTools, 8)
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
}

export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string,
  userModel?: string,
): Promise<boolean> {
  try {
    const fallback = provider === 'ollama' ? 'llama3'
      : provider === 'anthropic' ? 'claude-haiku-4-20250414'
      : provider === 'google' ? 'gemini-1.5-flash'
      : 'gpt-4o-mini'
    const model = userModel || fallback

    let reply: string
    if (provider === 'anthropic') {
      reply = await chatAnthropic(apiKey, model, undefined, 'hi', [], 1)
    } else {
      const resolvedBaseUrl = resolveBaseUrl(provider, baseUrl)
      const resolvedKey = resolveApiKey(provider, apiKey)
      reply = await chatOpenAI(resolvedKey, resolvedBaseUrl, model, undefined, 'hi', [], 1)
    }

    return !!reply
  } catch {
    return false
  }
}

import { AgentBuilder } from 'borderless-agent'
import type { AgentInstance, LLMConfig } from 'borderless-agent'
import { BrowserWindow } from 'electron'
import { getActiveProvider, loadSettings } from './settingsStore'

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
 * Build an AgentInstance from borderless-agent using the active provider config.
 */
function buildAgent(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string,
  systemPrompt?: string
): AgentInstance {
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

  const builder = new AgentBuilder()
    .setLLM(llmConfig)
    .setIncludeBuiltinTools(false)
    .enableStreaming()
    .enableContext()
    .setMaxToolRounds(1)

  if (systemPrompt) {
    builder.setSystemPrompt(systemPrompt)
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
  const agent = buildAgent(provider, apiKey, model, baseUrl, systemPrompt)

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

export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string
): Promise<boolean> {
  try {
    const model = provider === 'ollama' ? 'llama3' : provider === 'anthropic' ? 'claude-haiku-4-20250414' : provider === 'google' ? 'gemini-1.5-flash' : 'gpt-4o-mini'

    const agent = buildAgent(provider, apiKey, model, baseUrl)

    const result = await agent.chat('hi')
    await agent.close()

    return !!result.reply
  } catch {
    return false
  }
}

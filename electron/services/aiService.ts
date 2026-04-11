import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { BrowserWindow } from 'electron'
import { getActiveProvider } from './settingsStore'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface SendMessageRequest {
  messages: ChatMessage[]
  documentContext?: string
}

let currentAbortController: AbortController | null = null

export function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

export async function sendMessage(
  mainWindow: BrowserWindow,
  request: SendMessageRequest
): Promise<{ provider: string; model: string }> {
  const active = getActiveProvider()
  if (!active) {
    throw new Error('No AI provider configured. Please set up an API key in Settings.')
  }

  const { provider, model, apiKey } = active

  // Prepend document context as a system message if present
  const messages: ChatMessage[] = []
  if (request.documentContext) {
    messages.push({
      role: 'system',
      content: `You are an intelligent reading assistant for PrismMD, a Markdown reader. The user is currently reading the following document. Answer their questions based on this context.\n\n---\n\n${request.documentContext}`,
    })
  }
  messages.push(...request.messages)

  currentAbortController = new AbortController()
  const signal = currentAbortController.signal

  try {
    switch (provider) {
      case 'openai':
        await streamOpenAI(mainWindow, apiKey, model, messages, signal)
        break
      case 'anthropic':
        await streamAnthropic(mainWindow, apiKey, model, messages, signal)
        break
      case 'google':
        await streamGoogle(mainWindow, apiKey, model, messages, signal)
        break
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  } finally {
    currentAbortController = null
  }

  return { provider, model }
}

async function streamOpenAI(
  mainWindow: BrowserWindow,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
) {
  const openai = new OpenAI({ apiKey })

  const stream = await openai.chat.completions.create(
    {
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    },
    { signal }
  )

  for await (const chunk of stream) {
    if (signal.aborted) break
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      mainWindow.webContents.send('agent:stream-chunk', content)
    }
  }
}

async function streamAnthropic(
  mainWindow: BrowserWindow,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
) {
  const anthropic = new Anthropic({ apiKey })

  // Extract system message
  const systemMsg = messages.find((m) => m.role === 'system')
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

  const stream = anthropic.messages.stream(
    {
      model,
      max_tokens: 4096,
      system: systemMsg?.content,
      messages: chatMessages,
    },
    { signal }
  )

  for await (const event of stream) {
    if (signal.aborted) break
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      mainWindow.webContents.send('agent:stream-chunk', event.delta.text)
    }
  }
}

async function streamGoogle(
  mainWindow: BrowserWindow,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const genModel = genAI.getGenerativeModel({ model })

  // Build chat history (Google uses 'user' and 'model' roles)
  const systemMsg = messages.find((m) => m.role === 'system')
  const history = messages
    .filter((m) => m.role !== 'system')
    .slice(0, -1) // All except the last user message
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const lastMsg = messages[messages.length - 1]
  const prompt = systemMsg
    ? `${systemMsg.content}\n\n---\n\nUser question: ${lastMsg.content}`
    : lastMsg.content

  const chat = genModel.startChat({ history })
  const result = await chat.sendMessageStream(prompt)

  for await (const chunk of result.stream) {
    if (signal.aborted) break
    const text = chunk.text()
    if (text) {
      mainWindow.webContents.send('agent:stream-chunk', text)
    }
  }
}

export async function testConnection(provider: string, apiKey: string): Promise<boolean> {
  try {
    switch (provider) {
      case 'openai': {
        const openai = new OpenAI({ apiKey })
        await openai.models.list()
        return true
      }
      case 'anthropic': {
        const anthropic = new Anthropic({ apiKey })
        await anthropic.messages.create({
          model: 'claude-haiku-4-20250414',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        })
        return true
      }
      case 'google': {
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
        await model.generateContent('hi')
        return true
      }
      default:
        return false
    }
  } catch {
    return false
  }
}

/**
 * Shared provider mapping utility for the agent module.
 */
import type { ProviderName } from '../agent/providers/base'

export function mapProvider(active: {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}): { providerName: ProviderName; config: { apiKey: string; model: string; baseUrl?: string } } {
  switch (active.provider) {
    case 'anthropic':
      return { providerName: 'anthropic', config: { apiKey: active.apiKey, model: active.model } }
    case 'google':
      return { providerName: 'google', config: { apiKey: active.apiKey, model: active.model } }
    case 'ollama':
      return {
        providerName: 'openai',
        config: {
          apiKey: 'ollama',
          model: active.model,
          baseUrl: `${active.baseUrl ?? 'http://localhost:11434'}/v1`,
        },
      }
    case 'custom':
      return {
        providerName: 'openai',
        config: { apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl },
      }
    case 'openai':
    default:
      return {
        providerName: 'openai',
        config: { apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl },
      }
  }
}

/**
 * Safely close an agent with a timeout to prevent hangs.
 */
export async function safeClose(agent: { close(): Promise<void> }, timeoutMs = 2000): Promise<void> {
  await Promise.race([
    agent.close(),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ])
}

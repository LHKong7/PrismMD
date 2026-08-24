/**
 * Shared provider mapping utility for the agent module.
 */
import type { ProviderName } from '../agent/pi/models'

const KNOWN: readonly ProviderName[] = ['openai', 'anthropic', 'google', 'ollama', 'custom']

/**
 * 设置里的 provider 记录 → AgentBuilder 的 `setProvider()` 入参。
 *
 * 迁到 pi-ai 之前，这里要把 ollama / custom **伪装成 openai** 再手工拼
 * `/v1` 后缀，因为老的 provider 层只认 openai/anthropic/google 三个。
 * pi 里这两个是一等 provider（`pi/models.ts` 用 `createProvider()` 建），
 * 端点拼接也归那边负责，所以这里只剩下「校验名字」这一件事。
 */
export function mapProvider(active: {
  provider: string
  model: string
  apiKey: string
  baseUrl?: string
}): { providerName: ProviderName; config: { apiKey: string; model: string; baseUrl?: string } } {
  const providerName = (KNOWN as readonly string[]).includes(active.provider)
    ? (active.provider as ProviderName)
    : 'openai'
  return {
    providerName,
    config: { apiKey: active.apiKey, model: active.model, baseUrl: active.baseUrl },
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

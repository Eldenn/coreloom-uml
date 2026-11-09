import { createAnthropic } from '@ai-sdk/anthropic'
import { createMistral } from '@ai-sdk/mistral'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { PROVIDER_KINDS_WITH_BASE_URL, ProviderKind } from '@coreloom-uml/catalog'
import type { LanguageModel } from 'ai'
import { fetchWithoutRedirects } from './fetch.ts'

export { fetchWithoutRedirects }

/**
 * A provider as the browser keeps it, without its key: the key travels next to it, in the body
 * of each request, and is handed straight to the provider's client.
 */
export type ProviderSettings = {
  kind: ProviderKind
  model: string
  /** Required for `ollama` and `openai-compatible`, refused for the others. */
  baseUrl?: string | null
}

/** Whether this kind calls a server the user names (`baseUrl`), checked against the allowlist. */
export function takesBaseUrl(kind: ProviderKind): boolean {
  return PROVIDER_KINDS_WITH_BASE_URL.includes(kind)
}

/** Whether this kind needs a key: the hosted providers do, a local or private server may not. */
export function requiresApiKey(kind: ProviderKind): boolean {
  return !takesBaseUrl(kind)
}

/** Ollama serves its OpenAI-compatible API under `/v1`. */
function ollamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}

/**
 * The model to call. The key is always passed explicitly (an empty one for a server without
 * keys), so a provider client never falls back to a key from the server's environment.
 * `baseUrl` must already have passed `baseUrlProblem`.
 */
export function createLanguageModel(provider: ProviderSettings, apiKey: string): LanguageModel {
  const fetch = fetchWithoutRedirects
  switch (provider.kind) {
    case ProviderKind.Anthropic:
      return createAnthropic({ apiKey, fetch })(provider.model)
    case ProviderKind.OpenAI:
      return createOpenAI({ apiKey, fetch })(provider.model)
    case ProviderKind.Mistral:
      return createMistral({ apiKey, fetch })(provider.model)
    case ProviderKind.Ollama:
    case ProviderKind.OpenAICompatible: {
      if (!provider.baseUrl) throw new Error(`A ${provider.kind} provider needs a base URL`)
      return createOpenAICompatible({
        name: provider.kind,
        baseURL:
          provider.kind === ProviderKind.Ollama
            ? ollamaBaseUrl(provider.baseUrl)
            : provider.baseUrl.replace(/\/+$/, ''),
        apiKey: apiKey || undefined,
        fetch,
      })(provider.model)
    }
  }
}

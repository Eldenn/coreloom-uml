// The provider as this browser keeps it, and the body of a call made with it. Pure helpers, kept
// apart from the hooks (`llm-provider.ts`) so they run in Node unit tests.
import type { client } from '@/lib/client'

type ProvidersBody = Awaited<ReturnType<typeof client.api.llm.providers>>
export type ProviderKind = ProvidersBody['providers'][number]['kind']

/** Longest values the API accepts (`apps/api/app/llm/constants/llm.ts`). */
export const LLM_MODEL_MAX_LENGTH = 200
export const LLM_BASE_URL_MAX_LENGTH = 2000
export const LLM_API_KEY_MAX_LENGTH = 1000

/**
 * A provider as this browser keeps it. A key kind keeps its key (empty for a server that takes
 * none) and maybe a base URL; a subscription kind keeps neither: the server holds the connection.
 */
export interface StoredProvider {
  kind: ProviderKind
  model: string
  baseUrl?: string
  apiKey?: string
}

export function parseStoredProvider(raw: string | null): StoredProvider | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredProvider> | null
    if (!value || typeof value.kind !== 'string' || typeof value.model !== 'string') return null
    return {
      kind: value.kind,
      model: value.model,
      ...(typeof value.baseUrl === 'string' && value.baseUrl ? { baseUrl: value.baseUrl } : {}),
      ...(typeof value.apiKey === 'string' && value.apiKey ? { apiKey: value.apiKey } : {}),
    }
  } catch {
    return null
  }
}

/** The body every call with the user's provider sends: the settings, and the key next to them. */
export function callBody(provider: StoredProvider) {
  return {
    provider: {
      kind: provider.kind,
      model: provider.model,
      baseUrl: provider.baseUrl ?? null,
    },
    apiKey: provider.apiKey?.length ? provider.apiKey : null,
  }
}

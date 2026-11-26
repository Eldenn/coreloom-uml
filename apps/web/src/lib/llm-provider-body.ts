// The provider as this browser keeps it, and the body of a call made with it. Pure helpers, kept
// apart from the hooks (`llm-provider.ts`) so they run in Node unit tests.
import type { client } from '@/lib/client'

type ProvidersBody = Awaited<ReturnType<typeof client.api.llm.providers>>
export type ProviderKind = ProvidersBody['providers'][number]['kind']
type ProviderState = Pick<
  ProvidersBody['providers'][number],
  'kind' | 'auth' | 'connected' | 'requiresApiKey' | 'takesBaseUrl'
>

/** Longest values the API accepts (`apps/api/app/llm/constants/llm.ts`). */
export const LLM_MODEL_MAX_LENGTH = 200
export const LLM_BASE_URL_MAX_LENGTH = 2000
export const LLM_API_KEY_MAX_LENGTH = 1000
/** Shortest key `PUT /llm/api-keys/:kind` accepts (`saveApiKeyInput`). */
export const LLM_API_KEY_MIN_LENGTH = 16

/**
 * A provider as this browser keeps it: the kind and the model only. A key and a server URL are
 * saved to the account (`PUT /llm/api-keys/:kind`); a subscription is connected on the server.
 */
export interface StoredProvider {
  kind: ProviderKind
  model: string
}

/** A key, or a server URL, that an older version of the settings left in this browser's entry. */
export interface LegacyCredential {
  kind: ProviderKind
  apiKey: string
  baseUrl: string | null
}

function readEntry(
  raw: string | null,
): { kind: ProviderKind; model: string; rest: Record<string, unknown> } | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const { kind, model, ...rest } = value as Record<string, unknown>
    if (typeof kind !== 'string' || typeof model !== 'string') return null
    return { kind: kind as ProviderKind, model, rest }
  } catch {
    return null
  }
}

/** The kind and the model of the entry: a key or a URL an older entry holds is never read here. */
export function parseStoredProvider(raw: string | null): StoredProvider | null {
  const entry = readEntry(raw)
  return entry ? { kind: entry.kind, model: entry.model } : null
}

/** The key or server URL an older entry still holds, or `null` when it holds neither. */
export function legacyCredential(raw: string | null): LegacyCredential | null {
  const entry = readEntry(raw)
  if (!entry) return null
  const { apiKey, baseUrl } = entry.rest
  const key = typeof apiKey === 'string' ? apiKey.trim() : ''
  const url = typeof baseUrl === 'string' ? baseUrl.trim() : ''
  if (!key && !url) return null
  return { kind: entry.kind, apiKey: key, baseUrl: url || null }
}

/**
 * What `PUT /llm/api-keys/:kind` would save from an older entry, or `null` to drop it without
 * asking: a kind this server no longer lists, a subscription kind, a kind the account already
 * holds a key for (the account's key wins anyway) and what the API would refuse (no key for a
 * kind that needs one, no server URL for a kind that calls one, a key too short) are dropped.
 */
export function legacySaveBody(
  legacy: LegacyCredential,
  providers: readonly ProviderState[],
): { kind: ProviderKind; apiKey: string | null; baseUrl: string | null } | null {
  const info = providers.find((p) => p.kind === legacy.kind)
  if (!info || info.auth === 'subscription' || info.connected) return null
  if (legacy.apiKey && legacy.apiKey.length < LLM_API_KEY_MIN_LENGTH) return null
  if (info.requiresApiKey && !legacy.apiKey) return null
  if (info.takesBaseUrl && !legacy.baseUrl) return null
  return {
    kind: legacy.kind,
    apiKey: legacy.apiKey || null,
    baseUrl: info.takesBaseUrl ? legacy.baseUrl : null,
  }
}

/** The body every call with the user's provider sends: the kind and the model, never a key. */
export function callBody(provider: StoredProvider) {
  return { provider: { kind: provider.kind, model: provider.model } }
}

// The LLM provider form's values, what they save and where. Pure helpers, kept apart from the form
// (`llm-provider-section.tsx`) so they run in Node unit tests. The kind and the model are kept in
// this browser; a key and a server URL are saved to the account (`PUT /llm/api-keys/:kind`).
import type { ProviderInfo } from '@/lib/llm-provider'

import {
  LLM_MODEL_MAX_LENGTH,
  type ProviderKind,
  type StoredProvider,
} from '../lib/llm-provider-body'

export interface ProviderFields {
  kind: ProviderKind
  model: string
  baseUrl: string
  /** A new key being typed: sent once with Save, never kept in this browser. */
  apiKey: string
}

/** The body of `PUT /llm/api-keys/:kind`. */
export interface KeyToSave {
  kind: ProviderKind
  apiKey: string | null
  baseUrl: string | null
}

export function isSubscription(info: ProviderInfo | undefined): boolean {
  return info?.auth === 'subscription'
}

/** The server URL saved with the account's key for this kind, or an empty field. */
export function savedBaseUrl(info: ProviderInfo | undefined): string {
  return info?.baseUrl ?? ''
}

/** The form's values as the provider this browser keeps. */
export function toProvider(fields: ProviderFields): StoredProvider {
  return { kind: fields.kind, model: fields.model.trim() }
}

/**
 * What Save sends to the account, or `null` when its key stays as it is: a typed key (with the
 * server URL of a kind that takes one), or, for a server saved without a key, a new server URL.
 */
export function keyToSave(
  fields: ProviderFields,
  info: ProviderInfo | undefined,
): KeyToSave | null {
  if (!info || isSubscription(info)) return null
  const apiKey = fields.apiKey.trim()
  const baseUrl = info.takesBaseUrl ? fields.baseUrl.trim() : null
  if (apiKey) return { kind: info.kind, apiKey, baseUrl }
  const newUrl = !info.connected || baseUrl !== savedBaseUrl(info)
  if (info.takesBaseUrl && newUrl && !info.keyHint)
    return { kind: info.kind, apiKey: null, baseUrl }
  return null
}

/**
 * Why Save cannot go on without a typed key: the kind needs one and the account holds none, or
 * a new server URL would replace a saved key the browser cannot send again.
 */
export function saveProblem(
  fields: ProviderFields,
  info: ProviderInfo | undefined,
): 'apiKeyRequired' | 'apiKeyAgain' | null {
  if (!info || isSubscription(info) || fields.apiKey.trim()) return null
  if (info.requiresApiKey && !info.connected) return 'apiKeyRequired'
  if (info.takesBaseUrl && info.keyHint && fields.baseUrl.trim() !== savedBaseUrl(info))
    return 'apiKeyAgain'
  return null
}

/**
 * What to keep as soon as the kind or the model changes, or `null` to wait for "Save": a kind
 * the account cannot call yet (no key saved) waits rather than replace a working provider with
 * one that cannot be called. A subscription kind is kept at once; it is connected on its own.
 */
export function autoSaved(
  fields: ProviderFields,
  providers: ProviderInfo[],
): StoredProvider | null {
  const info = providers.find((p) => p.kind === fields.kind)
  const model = fields.model.trim()
  if (!info || !model || model.length > LLM_MODEL_MAX_LENGTH) return null
  if (!isSubscription(info) && !info.connected) return null
  return { kind: fields.kind, model }
}

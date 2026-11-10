// The LLM provider form's values, and the provider they make. Pure helpers, kept apart from the
// form (`llm-provider-section.tsx`) so they run in Node unit tests.
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
  apiKey: string
}

/** The saved key for this kind, if any: kept when the key field is left empty. */
export function savedKey(stored: StoredProvider | null, kind: ProviderKind): string | null {
  return stored?.kind === kind && stored.apiKey ? stored.apiKey : null
}

export function isSubscription(info: ProviderInfo | undefined): boolean {
  return info?.auth === 'subscription'
}

/** The form's values as a provider to save or test. */
export function toProvider(
  fields: ProviderFields,
  providers: ProviderInfo[],
  stored: StoredProvider | null,
): StoredProvider {
  const info = providers.find((p) => p.kind === fields.kind)
  // A subscription keeps no key and no base URL in this browser.
  if (isSubscription(info)) return { kind: fields.kind, model: fields.model.trim() }
  return {
    kind: fields.kind,
    model: fields.model.trim(),
    apiKey: fields.apiKey.trim() || (savedKey(stored, fields.kind) ?? ''),
    ...(info?.takesBaseUrl ? { baseUrl: fields.baseUrl.trim() } : {}),
  }
}

/**
 * What to save as soon as the kind or the model changes, or `null` to wait for "Save". Only the
 * kind and the model are saved this way, with the key and base URL already saved for that kind:
 * a key or URL being typed is never stored half-done, and a kind that still needs one waits for
 * "Save" rather than replace a working provider with one that cannot be called.
 */
export function autoSaved(
  fields: ProviderFields,
  providers: ProviderInfo[],
  stored: StoredProvider | null,
): StoredProvider | null {
  const info = providers.find((p) => p.kind === fields.kind)
  const model = fields.model.trim()
  if (!info || !model || model.length > LLM_MODEL_MAX_LENGTH) return null
  const baseUrl = stored?.kind === fields.kind ? (stored.baseUrl ?? '') : ''
  if (info.requiresApiKey && !savedKey(stored, fields.kind)) return null
  if (info.takesBaseUrl && !baseUrl) return null
  return toProvider({ kind: fields.kind, model, baseUrl, apiKey: '' }, providers, stored)
}

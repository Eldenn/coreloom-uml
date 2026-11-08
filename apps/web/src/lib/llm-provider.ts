// The user's own LLM provider (bring your own key). The settings live in this browser only,
// under `llm-provider` in localStorage: the server keeps no copy and receives the key in the body
// of each call (`POST /llm/test`, `POST /projects/:id/agent-config/proposals`), then drops it.
import { useMutation, useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { client, TuyauError } from '@/lib/client'

type ProvidersBody = Awaited<ReturnType<typeof client.api.llm.providers>>

export type ProviderInfo = ProvidersBody['providers'][number]
export type ProviderKind = ProviderInfo['kind']
export type LlmFailureReason = Extract<
  Awaited<ReturnType<typeof client.api.llm.test>>,
  { ok: false }
>['reason']
export type RuleProposal = Awaited<
  ReturnType<typeof client.api.projects.agentConfig.proposals.store>
>['proposals'][number]

/** A provider as this browser keeps it. `apiKey` is empty for a server that takes none. */
export interface StoredProvider {
  kind: ProviderKind
  model: string
  baseUrl?: string
  apiKey: string
}

/** Longest values the API accepts (`apps/api/app/llm/constants/llm.ts`). */
export const LLM_MODEL_MAX_LENGTH = 200
export const LLM_BASE_URL_MAX_LENGTH = 2000
export const LLM_API_KEY_MAX_LENGTH = 1000

const STORAGE_KEY = 'llm-provider'
/** Same-tab writes; other tabs hear the `storage` event. */
const CHANGE_EVENT = 'coreloom:llm-provider'

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): StoredProvider | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<StoredProvider> | null
    if (!value || typeof value.kind !== 'string' || typeof value.model !== 'string') return null
    return {
      kind: value.kind,
      model: value.model,
      apiKey: typeof value.apiKey === 'string' ? value.apiKey : '',
      ...(typeof value.baseUrl === 'string' && value.baseUrl ? { baseUrl: value.baseUrl } : {}),
    }
  } catch {
    return null
  }
}

let cache: { raw: string | null; value: StoredProvider | null } = { raw: null, value: null }

function snapshot(): StoredProvider | null {
  const raw = readRaw()
  if (raw !== cache.raw) cache = { raw, value: parse(raw) }
  return cache.value
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** Saves the provider in this browser; `null` forgets it, key included. */
export function storeProvider(provider: StoredProvider | null) {
  try {
    if (provider) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(provider))
    else window.localStorage.removeItem(STORAGE_KEY)
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
}

/** The provider saved in this browser, or `null`; follows changes made in other tabs. */
export function useStoredProvider(): StoredProvider | null {
  return React.useSyncExternalStore(subscribe, snapshot, () => null)
}

/** The body every call with the user's provider sends: the settings, and the key next to them. */
function callBody(provider: StoredProvider) {
  return {
    provider: {
      kind: provider.kind,
      model: provider.model,
      baseUrl: provider.baseUrl ?? null,
    },
    apiKey: provider.apiKey || null,
  }
}

/** The kinds this server can call, with model suggestions and the allowed base URLs. */
export function useLlmProviders() {
  return useQuery({
    queryKey: ['llm', 'providers'],
    queryFn: () => client.api.llm.providers({}),
    staleTime: Infinity,
  })
}

/** `POST /llm/test`: `{ ok, latencyMs }` or `{ ok: false, reason }`. */
export function useTestProvider() {
  return useMutation({
    mutationFn: (provider: StoredProvider) => client.api.llm.test({ body: callBody(provider) }),
  })
}

/** `POST …/agent-config/proposals`: proposed rules, nothing stored. */
export function useProposeRules(projectId: number) {
  return useMutation({
    mutationFn: (provider: StoredProvider) =>
      client.api.projects.agentConfig.proposals.store({
        params: { id: projectId },
        body: callBody(provider),
      }),
  })
}

/** Why a call with the user's provider failed, as the screen tells it. */
export type ProviderCallFailure =
  | { kind: 'provider'; reason: LlmFailureReason }
  | { kind: 'rate-limited' }
  | { kind: 'refused'; message: string | null }
  | { kind: 'other' }

export function providerCallFailure(error: unknown): ProviderCallFailure {
  if (!(error instanceof TuyauError)) return { kind: 'other' }
  const body = error.response as
    | { reason?: LlmFailureReason; error?: { message?: string }; errors?: { message?: string }[] }
    | undefined
  if (error.status === 502 && body?.reason) return { kind: 'provider', reason: body.reason }
  if (error.status === 429) return { kind: 'rate-limited' }
  if (error.status === 422)
    return {
      kind: 'refused',
      message: body?.error?.message ?? body?.errors?.[0]?.message ?? null,
    }
  return { kind: 'other' }
}

// The user's own LLM provider: a key (bring your own key) or a connected subscription (ChatGPT,
// Claude). The settings live in this browser only, under `llm-provider` in localStorage: the server
// keeps no copy and receives the key in the body of each call (`POST /llm/test`,
// `POST /projects/:id/agent-config/proposals`), then drops it. A subscription is connected once,
// on the server; this browser only keeps its kind and model.
import { useMutation, useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { client, TuyauError } from '@/lib/client'
import {
  callBody,
  parseStoredProvider,
  type ProviderKind,
  type StoredProvider,
} from '@/lib/llm-provider-body'
import { queryClient } from '@/lib/query'

export type { ProviderKind, StoredProvider }

type ProvidersBody = Awaited<ReturnType<typeof client.api.llm.providers>>

export type ProviderInfo = ProvidersBody['providers'][number]
export type LlmFailureReason = Extract<
  Awaited<ReturnType<typeof client.api.llm.test>>,
  { ok: false }
>['reason']
export type RuleProposal = Awaited<
  ReturnType<typeof client.api.projects.agentConfig.proposals.store>
>['proposals'][number]

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

let cache: { raw: string | null; value: StoredProvider | null } = { raw: null, value: null }

function snapshot(): StoredProvider | null {
  const raw = readRaw()
  if (raw !== cache.raw) cache = { raw, value: parseStoredProvider(raw) }
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

/** The kinds this server can call, with model suggestions and the allowed base URLs. */
const PROVIDERS_KEY = ['llm', 'providers'] as const

export function useLlmProviders() {
  return useQuery({
    queryKey: PROVIDERS_KEY,
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

function refreshProviders() {
  return queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY })
}

export type CodexAttempt = Awaited<
  ReturnType<typeof client.api.llm.connections.openaiCodex.attempts.store>
>
export type CodexAttemptStatus = Awaited<
  ReturnType<typeof client.api.llm.connections.openaiCodex.attempts.show>
>['status']

/** Starts a ChatGPT sign-in: a code to type on OpenAI's page. */
export function useStartCodexAttempt() {
  return useMutation({
    mutationFn: () => client.api.llm.connections.openaiCodex.attempts.store({}),
  })
}

/** Where the ChatGPT sign-in stands, asked again every `interval` seconds while it waits. */
export function useCodexAttempt(attempt: CodexAttempt | null) {
  return useQuery({
    queryKey: ['llm', 'codex-attempt', attempt?.attemptId ?? null],
    queryFn: async () => {
      const { status } = await client.api.llm.connections.openaiCodex.attempts.show({
        params: { attemptId: attempt?.attemptId ?? '' },
      })
      if (status === 'connected') await refreshProviders()
      return status
    },
    enabled: attempt !== null,
    // Stops once settled, or once the attempt is gone (expired from the server: an error).
    refetchInterval: (query) =>
      attempt && query.state.status !== 'error' && (query.state.data ?? 'pending') === 'pending'
        ? attempt.interval * 1000
        : false,
  })
}

/** Starts a Claude sign-in: the page the `claude` binary printed. */
export function useStartClaudeLogin() {
  return useMutation({
    mutationFn: () => client.api.llm.connections.claudeCode.login.store({}),
  })
}

/** Gives the code copied from Claude's page to the waiting sign-in. */
export function useSubmitClaudeCode() {
  return useMutation({
    mutationFn: (code: string) =>
      client.api.llm.connections.claudeCode.login.code({ body: { code } }),
    onSuccess: () => refreshProviders(),
  })
}

/** Disconnects a subscription: the server forgets the tokens or signs the binary out. */
export function useDisconnectSubscription() {
  return useMutation({
    mutationFn: (kind: ProviderKind) =>
      kind === 'claude-code'
        ? client.api.llm.connections.claudeCode.destroy({})
        : client.api.llm.connections.openaiCodex.destroy({}),
    onSuccess: () => refreshProviders(),
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

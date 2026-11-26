// The user's own LLM provider: a key (bring your own key) or a connected subscription (ChatGPT,
// Claude). This browser keeps only the kind and the model, under `llm-provider` in localStorage.
// A key, and the server URL of a kind that takes one, is saved to the account
// (`PUT /llm/api-keys/:kind`, after a test call), encrypted, and never comes back: the API reads
// it for every call, whose body names the kind and the model only (`callBody`). A subscription is
// connected once, on the server. A key an older version left in the entry is offered for saving
// once (`useLegacyCredential`), then dropped from the entry whatever the answer.
import { useMutation, useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { client, TuyauError } from '@/lib/client'
import {
  callBody,
  type LegacyCredential,
  legacyCredential,
  LLM_API_KEY_MAX_LENGTH,
  LLM_API_KEY_MIN_LENGTH,
  LLM_BASE_URL_MAX_LENGTH,
  LLM_MODEL_MAX_LENGTH,
  parseStoredProvider,
  type ProviderKind,
  type StoredProvider,
} from '@/lib/llm-provider-body'
import { queryClient } from '@/lib/query'

export type { LegacyCredential, ProviderKind, StoredProvider }
export {
  LLM_API_KEY_MAX_LENGTH,
  LLM_API_KEY_MIN_LENGTH,
  LLM_BASE_URL_MAX_LENGTH,
  LLM_MODEL_MAX_LENGTH,
}

type ProvidersBody = Awaited<ReturnType<typeof client.api.llm.providers>>

export type ProviderInfo = ProvidersBody['providers'][number]
export type LlmFailureReason = Extract<
  Awaited<ReturnType<typeof client.api.llm.test>>,
  { ok: false }
>['reason']
export type RuleProposal = Awaited<
  ReturnType<typeof client.api.agentConfigs.proposals.store>
>['proposals'][number]

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

let cache: {
  raw: string | null
  value: StoredProvider | null
  legacy: LegacyCredential | null
} = { raw: null, value: null, legacy: null }

function read() {
  const raw = readRaw()
  if (raw !== cache.raw)
    cache = { raw, value: parseStoredProvider(raw), legacy: legacyCredential(raw) }
  return cache
}

function snapshot(): StoredProvider | null {
  return read().value
}

function legacySnapshot(): LegacyCredential | null {
  return read().legacy
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

/**
 * Keeps the provider in this browser, its kind and model only; `null` forgets it. Writing the
 * entry also drops a key an older version left in it.
 */
export function storeProvider(provider: StoredProvider | null) {
  try {
    if (provider)
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ kind: provider.kind, model: provider.model }),
      )
    else window.localStorage.removeItem(STORAGE_KEY)
  } finally {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
}

/** Rewrites the entry without the key or server URL an older version left in it. */
export function dropLegacyCredential() {
  storeProvider(parseStoredProvider(readRaw()))
}

/** The provider kept in this browser, or `null`; follows changes made in other tabs. */
export function useStoredProvider(): StoredProvider | null {
  return React.useSyncExternalStore(subscribe, snapshot, () => null)
}

/** The key or server URL an older entry still holds, until it is saved or dropped. */
export function useLegacyCredential(): LegacyCredential | null {
  return React.useSyncExternalStore(subscribe, legacySnapshot, () => null)
}

/** The kinds this server can call, with model suggestions and the allowed base URLs. */
const PROVIDERS_KEY = ['llm', 'providers'] as const

export function useLlmProviders({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: () => client.api.llm.providers({}),
    staleTime: Infinity,
    enabled,
  })
}

/**
 * A model call takes longer than ky's default 10 s timeout (a Claude subscription often does): the
 * API bounds each one itself and answers 502 `{ reason: 'timeout' }`, so the browser waits for it.
 */
export const MODEL_CALL = { timeout: false } as const

/** `POST /llm/test` with the account's saved key: `{ ok, latencyMs }` or `{ ok: false, reason }`. */
export function useTestProvider() {
  return useMutation({
    mutationFn: (provider: StoredProvider) =>
      client.api.llm.test({ body: callBody(provider), ...MODEL_CALL }),
  })
}

/**
 * `PUT /llm/api-keys/:kind`: saves (or replaces) the account's key for a kind, with the server
 * URL of a kind that takes one, once a test call with it succeeded (502 `{ reason }` otherwise,
 * nothing saved). Answers the hint, the origin and the date, never the key.
 */
export function useSaveApiKey() {
  return useMutation({
    mutationFn: ({
      kind,
      apiKey,
      baseUrl,
    }: {
      kind: ProviderKind
      apiKey: string | null
      baseUrl: string | null
    }) =>
      client.api.llm.apiKeys.save({ params: { kind }, body: { apiKey, baseUrl }, ...MODEL_CALL }),
    onSuccess: () => refreshProviders(),
  })
}

/** `DELETE /llm/api-keys/:kind`: the account forgets its key for a kind. */
export function useDeleteApiKey() {
  return useMutation({
    mutationFn: (kind: ProviderKind) => client.api.llm.apiKeys.destroy({ params: { kind } }),
    onSuccess: () => refreshProviders(),
  })
}

/** `POST /agent-configs/:id/proposals`: proposed rules, nothing stored. */
export function useProposeRules(configId: number) {
  return useMutation({
    mutationFn: ({
      provider,
      ...source
    }: { provider: StoredProvider } & (
      { from: 'diagrams'; diagramIds: number[] } | { from: 'feedback'; feedback: string }
    )) =>
      client.api.agentConfigs.proposals.store({
        params: { id: configId },
        body: { ...callBody(provider), ...source },
        ...MODEL_CALL,
      }),
  })
}

export type ImportedReadyRule = Awaited<
  ReturnType<typeof client.api.agentConfigs.imports.store>
>['ready'][number]

/**
 * `POST /agent-configs/:id/imports`: ready-made and own rules read from a conventions file. Nothing
 * is stored, but the exchange of a research asked in an assistant conversation.
 */
export function useImportAgentFile(configId: number) {
  return useMutation({
    mutationFn: ({
      provider,
      content,
      origin,
      conversation,
      target = configId,
    }: {
      provider: StoredProvider
      content: string
      /** Other agent conventions than the hook's, when the caller learns them late. */
      target?: number
      /** `research` when the text is the findings of a web research. */
      origin?: 'file' | 'research'
      /**
       * With `research` only: the assistant conversation the research was asked in. The server
       * then stores the exchange there and answers its `messages`.
       */
      conversation?: { id: number; request: string; sources: ResearchSource[] }
    }) =>
      client.api.agentConfigs.imports.store({
        params: { id: target },
        body: { ...callBody(provider), content, origin, conversation },
        ...MODEL_CALL,
      }),
  })
}

export type ResearchSource = Awaited<
  ReturnType<typeof client.api.agentConfigs.research.store>
>['sources'][number]

/**
 * `POST /agent-configs/:id/research`: the model reads the pages a request names from a sandbox and
 * answers its findings, which go to the import (`origin: 'research'`). Nothing stored.
 */
export function useAgentResearch(configId: number) {
  return useMutation({
    mutationFn: ({
      provider,
      request,
      target = configId,
    }: {
      provider: StoredProvider
      request: string
      /** Other agent conventions than the hook's, when the caller learns them late. */
      target?: number
    }) =>
      client.api.agentConfigs.research.store({
        params: { id: target },
        body: { ...callBody(provider), request },
        ...MODEL_CALL,
      }),
  })
}

/** How often the screen asks what a running research has done. */
const RESEARCH_PROGRESS_INTERVAL_MS = 1000

export type ResearchStep = Awaited<
  ReturnType<typeof client.api.agentConfigs.research.show>
>['steps'][number]

/**
 * `GET /agent-configs/:id/research`: the addresses read and the commands run so far, asked again
 * while the research is pending. The server keeps none once it ends.
 */
export function useResearchProgress(configId: number, running: boolean) {
  return useQuery({
    queryKey: ['agent-configs', configId, 'research-progress'],
    queryFn: async () =>
      // Steps are only ever added at the end: the position is the identity.
      (await client.api.agentConfigs.research.show({ params: { id: configId } })).steps.map(
        (step, position) => ({ ...step, position }),
      ),
    enabled: running,
    refetchInterval: running ? RESEARCH_PROGRESS_INTERVAL_MS : false,
    // Each research starts from an empty list, not from the last one's steps.
    gcTime: 0,
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
  // 409: the account already has a web research running.
  if (error.status === 422 || error.status === 409)
    return {
      kind: 'refused',
      message: body?.error?.message ?? body?.errors?.[0]?.message ?? null,
    }
  return { kind: 'other' }
}

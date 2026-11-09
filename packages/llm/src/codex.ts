import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { fetchWithoutRedirects } from './fetch.ts'

/**
 * Sign in with a ChatGPT subscription (OAuth device code), and call its models.
 *
 * The values below were read on 2026-11-09 in Hermes Agent's source, which connects the same way
 * (`hermes_cli/auth_constants.py`, `hermes_cli/auth_codex.py`, `agent/codex_headers.py` and
 * `agent/codex_responses_adapter.py`). Re-read them before relying on a change in OpenAI's
 * behaviour. OpenAI asks third-party clients of the Codex endpoint to name themselves, so calls
 * carry this product's own `originator` and `User-Agent`.
 */
const ISSUER = 'https://auth.openai.com'

export const CODEX_OAUTH = {
  issuer: ISSUER,
  /** The public client id of OpenAI's Codex CLI. */
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  /** Where the user types the code. */
  verificationUrl: `${ISSUER}/codex/device`,
  deviceCodeUrl: `${ISSUER}/api/accounts/deviceauth/usercode`,
  deviceTokenUrl: `${ISSUER}/api/accounts/deviceauth/token`,
  tokenUrl: `${ISSUER}/oauth/token`,
  redirectUri: `${ISSUER}/deviceauth/callback`,
  /** The Responses API behind ChatGPT subscriptions; not the public API. */
  inferenceBaseUrl: 'https://chatgpt.com/backend-api/codex',
  originator: 'coreloom-uml',
  verifiedOn: '2026-11-09',
  source:
    'https://github.com/NousResearch/hermes-agent/tree/86b9622f018463e5d2df1a372069ac5778df7dd5/hermes_cli',
} as const

/** Longest wait for one call to OpenAI's sign-in endpoints (a refresh holds a row lock). */
export const CODEX_OAUTH_TIMEOUT_MS = 15_000

/** Shortest wait between two polls, whatever the server suggests. */
const MIN_INTERVAL_SECONDS = 3
const DEFAULT_INTERVAL_SECONDS = 5
const ACCOUNT_CLAIM = 'https://api.openai.com/auth'

export type CodexTokens = {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  accountId: string
}

/** What a call with a connected ChatGPT subscription needs. Never logged nor returned. */
export type CodexCredential = { kind: 'openai-codex'; accessToken: string; accountId: string }

/** The refresh token is dead (revoked, reused or expired): the user must connect again. */
export class CodexGrantError extends Error {
  constructor() {
    super('The ChatGPT subscription grant is no longer valid')
    this.name = 'CodexGrantError'
  }
}

/** An OAuth answer we cannot use. Carries the status only, never the body. */
export class CodexOAuthError extends Error {
  constructor(step: string, status: number) {
    super(`ChatGPT sign-in failed at ${step} (HTTP ${status})`)
    this.name = 'CodexOAuthError'
  }
}

function claims(token: unknown): Record<string, unknown> {
  if (typeof token !== 'string') return {}
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString())
    return payload && typeof payload === 'object' ? payload : {}
  } catch {
    return {}
  }
}

function accountIdOf(token: unknown): string | null {
  const auth = claims(token)[ACCOUNT_CLAIM]
  const id =
    auth && typeof auth === 'object' ? (auth as Record<string, unknown>).chatgpt_account_id : null
  return typeof id === 'string' && id ? id : null
}

/** Reads a token endpoint answer. Throws when it lacks the access token or the account id. */
export function parseCodexTokens(
  body: unknown,
  now: Date,
  previousRefreshToken?: string,
): CodexTokens {
  const value = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const accessToken = value.access_token
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('The token answer has no access token')
  }
  const refreshToken =
    typeof value.refresh_token === 'string' && value.refresh_token
      ? value.refresh_token
      : previousRefreshToken
  if (!refreshToken) throw new Error('The token answer has no refresh token')
  const accountId = accountIdOf(value.id_token) ?? accountIdOf(accessToken)
  if (!accountId) throw new Error('The token answer names no ChatGPT account')
  const exp = claims(accessToken).exp
  const expiresAt =
    typeof value.expires_in === 'number'
      ? new Date(now.getTime() + value.expires_in * 1000)
      : typeof exp === 'number'
        ? new Date(exp * 1000)
        : now
  return { accessToken, refreshToken, expiresAt, accountId }
}

function postJson(fetch: typeof globalThis.fetch, url: string, body: object) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(CODEX_OAUTH_TIMEOUT_MS),
  })
}

function postForm(fetch: typeof globalThis.fetch, url: string, body: Record<string, string>) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
    redirect: 'error',
    signal: AbortSignal.timeout(CODEX_OAUTH_TIMEOUT_MS),
  })
}

/** Step 1: a code for the user to type at `CODEX_OAUTH.verificationUrl`. */
export async function requestDeviceCode(
  fetch: typeof globalThis.fetch,
): Promise<{ deviceAuthId: string; userCode: string; intervalSeconds: number }> {
  const response = await postJson(fetch, CODEX_OAUTH.deviceCodeUrl, {
    client_id: CODEX_OAUTH.clientId,
  })
  if (!response.ok) throw new CodexOAuthError('device code', response.status)
  const body = (await response.json()) as Record<string, unknown>
  if (typeof body.device_auth_id !== 'string' || typeof body.user_code !== 'string') {
    throw new CodexOAuthError('device code', response.status)
  }
  const interval = Number(body.interval ?? DEFAULT_INTERVAL_SECONDS)
  return {
    deviceAuthId: body.device_auth_id,
    userCode: body.user_code,
    intervalSeconds: Math.max(
      MIN_INTERVAL_SECONDS,
      Number.isFinite(interval) ? Math.round(interval) : DEFAULT_INTERVAL_SECONDS,
    ),
  }
}

/** Step 2, once per poll: still waiting, refused, or the code pair to exchange. */
export async function pollDeviceAuthorization(
  fetch: typeof globalThis.fetch,
  attempt: { deviceAuthId: string; userCode: string },
): Promise<'pending' | 'denied' | { authorizationCode: string; codeVerifier: string }> {
  const response = await postJson(fetch, CODEX_OAUTH.deviceTokenUrl, {
    device_auth_id: attempt.deviceAuthId,
    user_code: attempt.userCode,
  })
  // 403/404: not entered yet; 429: OpenAI asks to slow down. Either way, keep waiting.
  if (response.status === 403 || response.status === 404 || response.status === 429) {
    return 'pending'
  }
  if (response.status >= 400 && response.status < 500) return 'denied'
  if (!response.ok) throw new CodexOAuthError('device authorization', response.status)
  const body = (await response.json()) as Record<string, unknown>
  if (typeof body.authorization_code !== 'string' || typeof body.code_verifier !== 'string') {
    throw new CodexOAuthError('device authorization', response.status)
  }
  return { authorizationCode: body.authorization_code, codeVerifier: body.code_verifier }
}

/** Step 3: the code pair for tokens. */
export async function exchangeAuthorizationCode(
  fetch: typeof globalThis.fetch,
  code: { authorizationCode: string; codeVerifier: string },
  now: Date,
): Promise<CodexTokens> {
  const response = await postForm(fetch, CODEX_OAUTH.tokenUrl, {
    grant_type: 'authorization_code',
    code: code.authorizationCode,
    redirect_uri: CODEX_OAUTH.redirectUri,
    client_id: CODEX_OAUTH.clientId,
    code_verifier: code.codeVerifier,
  })
  if (!response.ok) throw new CodexOAuthError('token exchange', response.status)
  return parseCodexTokens(await response.json(), now)
}

/** New tokens for an expiring access token. A dead grant throws `CodexGrantError`. */
export async function refreshCodexTokens(
  fetch: typeof globalThis.fetch,
  refreshToken: string,
  now: Date,
): Promise<CodexTokens> {
  const response = await postForm(fetch, CODEX_OAUTH.tokenUrl, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CODEX_OAUTH.clientId,
  })
  if (response.status === 400 || response.status === 401) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown }
    const code =
      typeof body.error === 'object' ? (body.error as { code?: unknown })?.code : body.error
    if (code === 'invalid_grant' || code === 'refresh_token_expired' || response.status === 401) {
      throw new CodexGrantError()
    }
  }
  if (!response.ok) throw new CodexOAuthError('token refresh', response.status)
  return parseCodexTokens(await response.json(), now, refreshToken)
}

type ResponsesBody = Record<string, unknown> & {
  input?: { role?: string; content?: unknown }[]
}

function instructionsOf(items: { role?: string; content?: unknown }[]): string {
  return items
    .map((item) =>
      typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.content)
          ? item.content.map((part) => (part as { text?: string }).text ?? '').join('')
          : '',
    )
    .join('\n\n')
}

/**
 * The `response` of the `response.completed` event of a Responses stream, or null. The Codex
 * endpoint may complete with an empty `output` and deliver the answer only as
 * `response.output_item.done` events: those items then stand in for it.
 */
async function completedResponse(stream: Response): Promise<unknown> {
  const text = await stream.text()
  const items: unknown[] = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!data || data === '[DONE]') continue
    try {
      const event = JSON.parse(data) as {
        type?: string
        item?: unknown
        response?: { output?: unknown[] }
      }
      if (event.type === 'response.output_item.done' && event.item) items.push(event.item)
      if (event.type === 'response.completed' && event.response) {
        const output = event.response.output
        return Array.isArray(output) && output.length > 0
          ? event.response
          : { ...event.response, output: items }
      }
    } catch {
      // A malformed event is skipped; a stream with no completed event fails below.
    }
  }
  return null
}

/**
 * Adapts the AI SDK's Responses calls to the Codex endpoint: system messages become
 * `instructions`, the call is unstored and streamed, `max_output_tokens` is dropped (the endpoint
 * refuses it), and the stream is read back into the single answer the SDK expects. A refused call
 * keeps its status, so its failure reason is the same as with a key.
 */
function codexFetch(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (input, init) => {
    if (init?.method !== 'POST' || !String(input).endsWith('/responses')) return fetch(input, init)
    const body = JSON.parse(String(init.body)) as ResponsesBody
    const items = body.input ?? []
    const system = items.filter((item) => item.role === 'system' || item.role === 'developer')
    const { max_output_tokens: _dropped, ...rest } = body
    const adapted = {
      ...rest,
      input: items.filter((item) => !system.includes(item)),
      instructions: instructionsOf(system),
      store: false,
      stream: true,
    }
    const response = await fetch(input, { ...init, body: JSON.stringify(adapted) })
    if (!response.ok) return response
    const completed = await completedResponse(response)
    if (!completed) {
      return new Response('{}', { status: 502, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify(completed), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

/** A model of the user's ChatGPT subscription. */
export function createCodexModel(
  model: string,
  credential: CodexCredential,
  fetch: typeof globalThis.fetch = fetchWithoutRedirects,
): LanguageModel {
  return createOpenAI({
    apiKey: credential.accessToken,
    baseURL: CODEX_OAUTH.inferenceBaseUrl,
    headers: {
      'ChatGPT-Account-ID': credential.accountId,
      originator: CODEX_OAUTH.originator,
      'User-Agent': CODEX_OAUTH.originator,
    },
    fetch: codexFetch(fetch),
  }).responses(model)
}

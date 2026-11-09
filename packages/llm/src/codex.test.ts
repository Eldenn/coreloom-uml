import { generateText, Output } from 'ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CODEX_OAUTH,
  CodexGrantError,
  createCodexModel,
  exchangeAuthorizationCode,
  parseCodexTokens,
  pollDeviceAuthorization,
  refreshCodexTokens,
  requestDeviceCode,
} from './codex.ts'
import { failureReason } from './failure.ts'

const NOW = new Date('2026-11-09T12:00:00Z')

function jwt(payload: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(payload)}.sig`
}

const ACCESS = jwt({
  exp: NOW.getTime() / 1000 + 3600,
  'https://api.openai.com/auth': { chatgpt_account_id: 'acct-1' },
})

type Seen = { url: string; init: RequestInit }

/** A fetch that records each request and answers with the next response of the list. */
function fakeFetch(...responses: Response[]) {
  const seen: Seen[] = []
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    seen.push({ url: String(input), init })
    const next = responses.shift()
    if (!next) throw new Error('No response left')
    return next
  }
  return { fetch, seen }
}

function first(seen: Seen[]): Seen {
  const call = seen[0]
  if (!call) throw new Error('No request was sent')
  return call
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('parseCodexTokens', () => {
  it('reads the account id from the token claims and the expiry from expires_in', () => {
    const tokens = parseCodexTokens(
      { access_token: ACCESS, refresh_token: 'r1', expires_in: 600 },
      NOW,
    )
    expect(tokens).toEqual({
      accessToken: ACCESS,
      refreshToken: 'r1',
      expiresAt: new Date(NOW.getTime() + 600_000),
      accountId: 'acct-1',
    })
  })

  it('falls back to the JWT expiry, and keeps the previous refresh token', () => {
    const tokens = parseCodexTokens({ access_token: ACCESS }, NOW, 'old')
    expect(tokens.expiresAt).toEqual(new Date(NOW.getTime() + 3600_000))
    expect(tokens.refreshToken).toBe('old')
  })

  it('prefers the id token claims', () => {
    const idToken = jwt({ 'https://api.openai.com/auth': { chatgpt_account_id: 'acct-id' } })
    const tokens = parseCodexTokens(
      { access_token: ACCESS, id_token: idToken, refresh_token: 'r' },
      NOW,
    )
    expect(tokens.accountId).toBe('acct-id')
  })

  it('refuses tokens without an access token or an account id', () => {
    expect(() => parseCodexTokens({ refresh_token: 'r' }, NOW)).toThrow()
    expect(() => parseCodexTokens({ access_token: jwt({}), refresh_token: 'r' }, NOW)).toThrow()
  })
})

describe('device code flow', () => {
  it('asks for a code with the Codex client id, without following redirects', async () => {
    const { fetch, seen } = fakeFetch(
      json({ device_auth_id: 'dev-1', user_code: 'ABCD-1234', interval: '1' }),
    )
    const code = await requestDeviceCode(fetch)
    expect(code).toEqual({ deviceAuthId: 'dev-1', userCode: 'ABCD-1234', intervalSeconds: 3 })
    expect(first(seen).url).toBe('https://auth.openai.com/api/accounts/deviceauth/usercode')
    expect(JSON.parse(String(first(seen).init.body))).toEqual({
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    })
  })

  it('reads 403 and 404 as pending, another 4xx as denied, 200 as the code pair', async () => {
    const attempt = { deviceAuthId: 'dev-1', userCode: 'ABCD-1234' }
    const { fetch, seen } = fakeFetch(
      json({}, 404),
      json({}, 403),
      json({}, 400),
      json({ authorization_code: 'auth-1', code_verifier: 'ver-1' }),
    )
    expect(await pollDeviceAuthorization(fetch, attempt)).toBe('pending')
    expect(await pollDeviceAuthorization(fetch, attempt)).toBe('pending')
    expect(await pollDeviceAuthorization(fetch, attempt)).toBe('denied')
    expect(await pollDeviceAuthorization(fetch, attempt)).toEqual({
      authorizationCode: 'auth-1',
      codeVerifier: 'ver-1',
    })
    expect(first(seen).url).toBe('https://auth.openai.com/api/accounts/deviceauth/token')
    expect(JSON.parse(String(first(seen).init.body))).toEqual({
      device_auth_id: 'dev-1',
      user_code: 'ABCD-1234',
    })
  })

  it('throws on a server error while polling', async () => {
    const { fetch } = fakeFetch(json({}, 500))
    await expect(
      pollDeviceAuthorization(fetch, { deviceAuthId: 'd', userCode: 'u' }),
    ).rejects.toThrow()
  })

  it('exchanges the code pair for tokens', async () => {
    const { fetch, seen } = fakeFetch(
      json({ access_token: ACCESS, refresh_token: 'r1', expires_in: 600 }),
    )
    const tokens = await exchangeAuthorizationCode(
      fetch,
      { authorizationCode: 'auth-1', codeVerifier: 'ver-1' },
      NOW,
    )
    expect(tokens.accountId).toBe('acct-1')
    expect(first(seen).url).toBe('https://auth.openai.com/oauth/token')
    expect(Object.fromEntries(new URLSearchParams(String(first(seen).init.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'auth-1',
      redirect_uri: 'https://auth.openai.com/deviceauth/callback',
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
      code_verifier: 'ver-1',
    })
    expect(first(seen).init.redirect).toBe('error')
  })

  it('refreshes, and reports a dead grant', async () => {
    const { fetch, seen } = fakeFetch(
      json({ access_token: ACCESS, expires_in: 600 }),
      json({ error: 'invalid_grant' }, 400),
    )
    const tokens = await refreshCodexTokens(fetch, 'r-old', NOW)
    expect(tokens.refreshToken).toBe('r-old')
    expect(Object.fromEntries(new URLSearchParams(String(first(seen).init.body)))).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'r-old',
      client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    })
    await expect(refreshCodexTokens(fetch, 'r-old', NOW)).rejects.toBeInstanceOf(CodexGrantError)
  })
})

function completed(text: string) {
  const response = {
    id: 'resp_1',
    object: 'response',
    created_at: 1_700_000_000,
    model: 'gpt-5.5',
    status: 'completed',
    output: [
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    incomplete_details: null,
    usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
  }
  const events = [
    { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
    { type: 'response.completed', response },
  ]
  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

const CREDENTIAL = { kind: 'openai-codex', accessToken: ACCESS, accountId: 'acct-1' } as const

describe('createCodexModel', () => {
  it('calls the Codex endpoint as a streamed, unstored Responses call', async () => {
    const { fetch, seen } = fakeFetch(completed('OK'))
    const result = await generateText({
      model: createCodexModel('gpt-5.5', CREDENTIAL, fetch),
      system: 'S',
      prompt: 'P',
      maxOutputTokens: 5,
      maxRetries: 0,
    })
    expect(result.text).toBe('OK')
    expect(first(seen).url).toBe(`${CODEX_OAUTH.inferenceBaseUrl}/responses`)
    const headers = new Headers(first(seen).init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${ACCESS}`)
    expect(headers.get('chatgpt-account-id')).toBe('acct-1')
    expect(headers.get('originator')).toBe('coreloom-uml')
    const body = JSON.parse(String(first(seen).init.body))
    expect(body.store).toBe(false)
    expect(body.stream).toBe(true)
    expect(body.instructions).toBe('S')
    expect(body.max_output_tokens).toBeUndefined()
    expect(
      body.input.some((item: { role?: string }) =>
        ['system', 'developer'].includes(item.role ?? ''),
      ),
    ).toBe(false)
  })

  it('asks for structured output', async () => {
    const { fetch, seen } = fakeFetch(completed('{"answer":"yes"}'))
    const result = await generateText({
      model: createCodexModel('gpt-5.5', CREDENTIAL, fetch),
      prompt: 'P',
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      maxRetries: 0,
    })
    expect(result.output).toEqual({ answer: 'yes' })
    expect(JSON.parse(String(first(seen).init.body)).text.format.type).toBe('json_schema')
  })

  it('keeps the status of a refused call', async () => {
    const { fetch } = fakeFetch(json({ error: { message: 'no' } }, 401))
    const error = await generateText({
      model: createCodexModel('gpt-5.5', CREDENTIAL, fetch),
      prompt: 'P',
      maxRetries: 0,
    }).catch((caught: unknown) => caught)
    expect(failureReason(error)).toBe('unauthorized')
  })

  it('fails a stream that never completes', async () => {
    const { fetch } = fakeFetch(
      new Response('event: response.failed\ndata: {"type":"response.failed"}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    await expect(
      generateText({
        model: createCodexModel('gpt-5.5', CREDENTIAL, fetch),
        prompt: 'P',
        maxRetries: 0,
      }),
    ).rejects.toThrow()
  })
})

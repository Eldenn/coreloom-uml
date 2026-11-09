import app from '@adonisjs/core/services/app'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'

/** An access token shaped like OpenAI's: a JWT naming the ChatGPT account. */
export function codexJwt(accountId: string, salt = '') {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part({
    salt,
    exp: Math.floor(Date.now() / 1000) + 3600,
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.sig`
}

type FakeOptions = {
  /** What the device code endpoint answers. */
  deviceCode?: object
  /** Status of the device token poll: 404 pending, 200 authorized, 400 denied. */
  pollStatus?: number
  /** Body of the token endpoint, for an exchange or a refresh. */
  refresh?: object
  refreshStatus?: number
  delayMs?: number
}

/**
 * Swaps the container's `CodexOAuth` for one whose `fetch` is a fake OpenAI sign-in server.
 * Records every request; nothing leaves the process.
 */
export function fakeCodexOAuth(options: FakeOptions) {
  const seen: { url: string; body: string }[] = []
  const reply = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input)
    seen.push({ url, body: String(init?.body ?? '') })
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    if (url.endsWith('/deviceauth/usercode')) {
      return reply(
        options.deviceCode ?? { device_auth_id: 'dev-1', user_code: 'ABCD-1234', interval: '5' },
      )
    }
    if (url.endsWith('/deviceauth/token')) {
      const status = options.pollStatus ?? 404
      return reply(
        status === 200 ? { authorization_code: 'auth-1', code_verifier: 'ver-1' } : {},
        status,
      )
    }
    if (url.endsWith('/oauth/token')) {
      return reply(options.refresh ?? {}, options.refreshStatus ?? 200)
    }
    return reply({}, 404)
  }
  app.container.swap(CodexOAuth, () => {
    const fake = new CodexOAuth()
    fake.fetch = fetch
    return fake
  })
  return {
    seen,
    calls: (path: string) => seen.filter((request) => request.url.endsWith(path)),
  }
}

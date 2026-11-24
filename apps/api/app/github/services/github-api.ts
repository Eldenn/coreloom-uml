import { createSign } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import {
  GITHUB_API_VERSION,
  GITHUB_LIMITS,
  GITHUB_SOURCE_LIMITS,
  GITHUB_URLS,
  GITHUB_USER_AGENT,
  GithubAppOwnerType,
  GithubFailure,
} from '#app/github/constants/github'
import type { GithubAppCredentials } from '#app/github/models/github-app-registration'
import type { GithubAppConfig } from '#app/github/services/github-app-config'

/**
 * Every call the server makes to GitHub for the App. Resolved from the container, so tests swap
 * it (`app.container.swap(GithubApi, ...)`) and never reach GitHub.
 *
 * Tokens (the user's, an installation's) live only in the caller's memory: they are never stored,
 * logged, queued or put in an error. A failure is reduced to a `GithubFailure`.
 */

export type GithubResult<T> = { ok: true; value: T } | { ok: false; failure: GithubFailure }

/** A repository a GitHub user can read through one of the App's installations. */
export type GithubRepositoryAccess = {
  installationId: number
  repositoryId: number
  owner: string
  name: string
  private: boolean
  defaultBranch: string
}

export type GithubConnection = {
  user: { id: number; login: string }
  /** The accounts the App is installed on that the user reaches (`login`). */
  accounts: string[]
  repositories: GithubRepositoryAccess[]
}

/** The App GitHub created from the manifest, with its secrets (stored encrypted, never shown). */
export type GithubCreatedApp = {
  appId: number
  slug: string
  name: string
  clientId: string
  owner: { login: string; type: GithubAppOwnerType }
  credentials: GithubAppCredentials
}

type InstallationJson = {
  id: number
  account?: { login?: string } | null
  suspended_at?: string | null
}
type RepositoryJson = {
  id: number
  name: string
  owner: { login: string }
  private: boolean
  default_branch?: string
  archived?: boolean
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const SLUG = /^[a-z0-9-]{1,100}$/i
const CLIENT_ID = /^[A-Za-z0-9._-]{1,100}$/
const NAME = /^[A-Za-z0-9._-]{1,100}$/
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/

export default class GithubApi {
  /**
   * Trades the `code` GitHub sent back once the admin created the App from its manifest for the
   * App's settings and secrets. Good once, within the hour; no authentication.
   */
  async convertManifest(code: string): Promise<GithubResult<GithubCreatedApp>> {
    const answer = await this.#api(`/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: 'POST',
    })
    if (!answer.ok) return answer
    const created = toCreatedApp(answer.value)
    return created ? { ok: true, value: created } : { ok: false, failure: GithubFailure.Denied }
  }

  /** Trades the `code` GitHub sent back to the callback for a user token. */
  async exchangeCode(config: GithubAppConfig, code: string): Promise<GithubResult<string>> {
    const answer = await this.#call(`${GITHUB_URLS.web}/login/oauth/access_token`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
      }),
    })
    if (!answer.ok) return answer
    const body = answer.value as { access_token?: unknown }
    // A bad or used code is a 200 with `error`, and no token.
    if (typeof body.access_token !== 'string' || body.access_token === '') {
      return { ok: false, failure: GithubFailure.Denied }
    }
    return { ok: true, value: body.access_token }
  }

  /** Who the user is, and every repository of the App's installations they can read. */
  async readConnection(userToken: string): Promise<GithubResult<GithubConnection>> {
    const auth = { authorization: `Bearer ${userToken}` }
    const user = await this.#api('/user', { headers: auth })
    if (!user.ok) return user
    const { id, login } = user.value as { id?: unknown; login?: unknown }
    if (typeof id !== 'number' || typeof login !== 'string')
      return { ok: false, failure: GithubFailure.Denied }

    const installations: InstallationJson[] = []
    for (let page = 1; installations.length < GITHUB_LIMITS.installations; page++) {
      const answer = await this.#api(
        `/user/installations?per_page=${String(GITHUB_LIMITS.perPage)}&page=${String(page)}`,
        { headers: auth },
      )
      if (!answer.ok) return answer
      const batch = (answer.value as { installations?: InstallationJson[] }).installations ?? []
      installations.push(...batch)
      if (batch.length < GITHUB_LIMITS.perPage) break
    }

    const accounts: string[] = []
    const repositories: GithubRepositoryAccess[] = []
    for (const installation of installations.slice(0, GITHUB_LIMITS.installations)) {
      // A suspended installation gives no token: its repositories cannot be read.
      if (installation.suspended_at) continue
      if (installation.account?.login) accounts.push(installation.account.login)
      for (let page = 1; repositories.length < GITHUB_LIMITS.repositories; page++) {
        const answer = await this.#api(
          `/user/installations/${String(installation.id)}/repositories?per_page=${String(GITHUB_LIMITS.perPage)}&page=${String(page)}`,
          { headers: auth },
        )
        if (!answer.ok) return answer
        const batch = (answer.value as { repositories?: RepositoryJson[] }).repositories ?? []
        for (const repository of batch) {
          const access = toAccess(installation.id, repository)
          if (access && repositories.length < GITHUB_LIMITS.repositories) repositories.push(access)
        }
        if (batch.length < GITHUB_LIMITS.perPage) break
      }
    }
    return { ok: true, value: { user: { id, login }, accounts, repositories } }
  }

  /** Revokes a user token once the connection is read: the server keeps none. */
  async revokeUserToken(config: GithubAppConfig, userToken: string): Promise<void> {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    await this.#api(`/applications/${encodeURIComponent(config.clientId)}/token`, {
      method: 'DELETE',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: userToken }),
    })
  }

  /**
   * A token that reads one repository's contents through an installation, valid one hour. The
   * caller hands it to a sandbox for one clone and revokes it right after.
   */
  async installationToken(
    config: GithubAppConfig,
    installationId: number,
    repositoryId: number,
  ): Promise<GithubResult<string>> {
    const answer = await this.#api(
      `/app/installations/${String(installationId)}/access_tokens`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${appJwt(config)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          repository_ids: [repositoryId],
          permissions: { contents: 'read', metadata: 'read' },
        }),
      },
      'GitHub refused an installation token',
    )
    if (!answer.ok) return answer
    const token = (answer.value as { token?: unknown }).token
    if (typeof token !== 'string' || token === '')
      return { ok: false, failure: GithubFailure.Denied }
    return { ok: true, value: token }
  }

  async revokeInstallationToken(token: string): Promise<void> {
    await this.#api('/installation/token', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    })
  }

  /**
   * Whether this GitHub login still reads the repository, asked with an installation token. A
   * grant is only what GitHub listed on the day of the connection: this is today's answer.
   */
  async canRead(
    repository: { owner: string; name: string },
    login: string,
    token: string,
  ): Promise<GithubResult<boolean>> {
    if (!isRepository(repository) || !OWNER.test(login)) return { ok: true, value: false }
    const response = await this.#send(
      `${GITHUB_URLS.api}/repos/${repository.owner}/${repository.name}/collaborators/${login}/permission`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': GITHUB_API_VERSION,
          authorization: `Bearer ${token}`,
        },
      },
    )
    if (!response) return { ok: false, failure: GithubFailure.Unreachable }
    if (!response.ok) {
      await response.body?.cancel()
      const failure = failureOf(response.status)
      return failure === GithubFailure.Denied ? { ok: true, value: false } : { ok: false, failure }
    }
    try {
      const { permission } = (await response.json()) as { permission?: unknown }
      return { ok: true, value: READ_PERMISSIONS.includes(permission as string) }
    } catch {
      return { ok: false, failure: GithubFailure.Unreachable }
    }
  }

  #api(path: string, init: RequestInit, refusal?: string): Promise<GithubResult<unknown>> {
    return this.#call(
      `${GITHUB_URLS.api}${path}`,
      {
        ...init,
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': GITHUB_API_VERSION,
          ...(init.headers as Record<string, string>),
        },
      },
      refusal,
    )
  }

  /**
   * With `refusal`, a refused call is logged with its status and GitHub's own `message` (a
   * sentence such as "The permissions requested are not granted to this installation."), never
   * the request: it carries the App's JWT or a token.
   */
  async #call(url: string, init: RequestInit, refusal?: string): Promise<GithubResult<unknown>> {
    const response = await this.#send(url, init)
    if (!response) return { ok: false, failure: GithubFailure.Unreachable }
    if (response.status === 204) return { ok: true, value: null }
    if (!response.ok) {
      if (refusal)
        logger.warn({ status: response.status, message: await errorMessage(response) }, refusal)
      else await response.body?.cancel()
      return { ok: false, failure: failureOf(response.status) }
    }
    try {
      return { ok: true, value: await response.json() }
    } catch {
      return { ok: false, failure: GithubFailure.Unreachable }
    }
  }

  /** One call with the fixed header, timeout and no redirect; null when GitHub is not reached. */
  async #send(url: string, init: RequestInit): Promise<Response | null> {
    try {
      return await fetch(url, {
        ...init,
        headers: { 'user-agent': GITHUB_USER_AGENT, ...(init.headers as Record<string, string>) },
        redirect: 'error',
        signal: AbortSignal.timeout(GITHUB_LIMITS.requestTimeoutMs),
      })
    } catch {
      return null
    }
  }
}

/** The base roles GitHub answers for someone who reads a repository. */
const READ_PERMISSIONS: readonly string[] = ['admin', 'write', 'read']

/** A repository GitHub can be asked about: its name cannot be read as a path step. */
function isRepository({ owner, name }: { owner: string; name: string }): boolean {
  return OWNER.test(owner) && NAME.test(name) && name !== '.' && name !== '..'
}

/** 401, 403, 404, 422: the code, token or installation is refused. 5xx and 429: try later. */
function failureOf(status: number): GithubFailure {
  return status < 500 && status !== 429 ? GithubFailure.Denied : GithubFailure.Unreachable
}

/** GitHub's `message` in an error body, cut to 300 characters; null when there is none. */
async function errorMessage(response: Response): Promise<string | null> {
  const body = await readCapped(response, 16_384).catch(() => null)
  if (!body) return null
  try {
    const message = (JSON.parse(Buffer.from(body).toString('utf8')) as { message?: unknown })
      .message
    return typeof message === 'string' ? message.slice(0, 300) : null
  } catch {
    return null
  }
}

/** The body, or null as soon as it grows past `limit` bytes (the rest is never downloaded). */
async function readCapped(response: Response, limit: number): Promise<Uint8Array | null> {
  if (Number(response.headers.get('content-length') ?? 0) > limit) {
    await response.body?.cancel()
    return null
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return Buffer.concat(chunks, size)
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
}

/** True for a relative path GitHub can be asked for: no `..`, `.` or empty segment, no leading `/`, no `\`, no control character, at most `GITHUB_SOURCE_LIMITS.pathLength` characters. */
export function isRepositoryPath(path: string): boolean {
  if (path === '' || path.length > GITHUB_SOURCE_LIMITS.pathLength) return false
  // A lone surrogate cannot be encoded in a URL.
  if (/\p{Surrogate}/u.test(path)) return false
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
  if (path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** A commit id: 7 to 64 hexadecimal characters. */
export function isCommitId(value: string): boolean {
  return /^[0-9a-f]{7,64}$/i.test(value)
}

function toCreatedApp(value: unknown): GithubCreatedApp | null {
  if (!value || typeof value !== 'object') return null
  const body = value as Record<string, unknown>
  const owner = body.owner as { login?: unknown; type?: unknown } | null | undefined
  const { id, slug, name, client_id: clientId, client_secret: clientSecret, pem } = body
  const webhookSecret = body.webhook_secret
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  if (typeof slug !== 'string' || !SLUG.test(slug)) return null
  if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) return null
  if (typeof clientSecret !== 'string' || clientSecret === '') return null
  if (typeof pem !== 'string' || !pem.startsWith('-----BEGIN')) return null
  if (typeof owner?.login !== 'string' || !OWNER.test(owner.login)) return null
  return {
    appId: id,
    slug,
    name: typeof name === 'string' && name !== '' ? name.slice(0, 100) : slug,
    clientId,
    owner: {
      login: owner.login,
      type:
        owner.type === GithubAppOwnerType.Organization
          ? GithubAppOwnerType.Organization
          : GithubAppOwnerType.User,
    },
    credentials: {
      clientSecret,
      privateKey: pem,
      webhookSecret:
        typeof webhookSecret === 'string' && webhookSecret !== '' ? webhookSecret : null,
    },
  }
}

function toAccess(
  installationId: number,
  repository: RepositoryJson,
): GithubRepositoryAccess | null {
  const owner = repository.owner?.login
  if (typeof repository.id !== 'number' || typeof owner !== 'string') return null
  if (!OWNER.test(owner) || !NAME.test(repository.name)) return null
  const branch = repository.default_branch ?? 'main'
  return {
    installationId,
    repositoryId: repository.id,
    owner,
    name: repository.name,
    private: repository.private === true,
    defaultBranch: BRANCH.test(branch) ? branch : 'main',
  }
}

/** The App's own token: a JWT signed with its private key (RS256), valid nine minutes. */
export function appJwt(config: GithubAppConfig, now = Date.now()): string {
  const seconds = Math.floor(now / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64Url(
    JSON.stringify({
      iat: seconds - GITHUB_LIMITS.appJwtBackdateSeconds,
      exp: seconds + GITHUB_LIMITS.appJwtSeconds,
      iss: config.appId,
    }),
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  return `${header}.${payload}.${signer.sign(config.privateKey).toString('base64url')}`
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

import { createSign } from 'node:crypto'
import {
  GITHUB_API_VERSION,
  GITHUB_LIMITS,
  GITHUB_URLS,
  GITHUB_USER_AGENT,
  GithubFailure,
} from '#app/github/constants/github'
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
const NAME = /^[A-Za-z0-9._-]{1,100}$/
const BRANCH = /^[A-Za-z0-9._/-]{1,200}$/

export default class GithubApi {
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
   * caller hands it to the analyzer for one clone and revokes it right after.
   */
  async installationToken(
    config: GithubAppConfig,
    installationId: number,
    repositoryId: number,
  ): Promise<GithubResult<string>> {
    const answer = await this.#api(`/app/installations/${String(installationId)}/access_tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${appJwt(config)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        repository_ids: [repositoryId],
        permissions: { contents: 'read', metadata: 'read' },
      }),
    })
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

  #api(path: string, init: RequestInit): Promise<GithubResult<unknown>> {
    return this.#call(`${GITHUB_URLS.api}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': GITHUB_API_VERSION,
        ...(init.headers as Record<string, string>),
      },
    })
  }

  async #call(url: string, init: RequestInit): Promise<GithubResult<unknown>> {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: { 'user-agent': GITHUB_USER_AGENT, ...(init.headers as Record<string, string>) },
        redirect: 'error',
        signal: AbortSignal.timeout(GITHUB_LIMITS.requestTimeoutMs),
      })
    } catch {
      return { ok: false, failure: GithubFailure.Unreachable }
    }
    if (response.status === 204) return { ok: true, value: null }
    if (!response.ok) {
      await response.body?.cancel()
      // 401, 403, 404, 422: the code, token or installation is refused. 5xx and 429: try later.
      const denied = response.status < 500 && response.status !== 429
      return { ok: false, failure: denied ? GithubFailure.Denied : GithubFailure.Unreachable }
    }
    try {
      return { ok: true, value: await response.json() }
    } catch {
      return { ok: false, failure: GithubFailure.Unreachable }
    }
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

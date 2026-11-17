import encryption from '@adonisjs/core/services/encryption'
import { TokenPurpose } from '#app/auth/constants/token-purpose'
import { GITHUB_DEFAULT_RETURN_TO, GITHUB_LIMITS } from '#app/github/constants/github'
import type User from '#app/users/models/user'

/**
 * The `state` of a GitHub App connection: encrypted with APP_KEY, bound to the user who started
 * it, valid ten minutes. GitHub sends it back with the `code`; a `code` arriving with another
 * user's state, or none, is refused, so nobody can link their own GitHub account (or anyone
 * else's installation) to someone else's session.
 */

type StatePayload = { u: number; r: string }

export function createGithubState(user: User, returnTo: string | undefined): string {
  return encryption.encrypt({ u: user.id, r: safeReturnTo(returnTo) } satisfies StatePayload, {
    expiresIn: GITHUB_LIMITS.stateTtl,
    purpose: TokenPurpose.GithubConnection,
  })
}

/** Where to go back to, or null when the state is not this user's, expired or forged. */
export function readGithubState(state: string, user: User): string | null {
  const payload = encryption.decrypt<StatePayload>(state, TokenPurpose.GithubConnection)
  if (!payload || payload.u !== user.id) return null
  return safeReturnTo(payload.r)
}

/** A path of the web app (`/projects/3?tab=code`), never another origin. */
export function safeReturnTo(value: string | undefined): string {
  if (
    !value ||
    value.length > GITHUB_LIMITS.returnTo ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((char) => char.charCodeAt(0) < 0x20)
  ) {
    return GITHUB_DEFAULT_RETURN_TO
  }
  return value
}

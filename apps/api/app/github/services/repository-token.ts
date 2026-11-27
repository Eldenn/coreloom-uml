import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import type { GithubFailure } from '#app/github/constants/github'
import GithubApi from '#app/github/services/github-api'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrant } from '#app/github/services/github-grants'

/**
 * A read-only token for this one repository when the user reaches it through the GitHub App,
 * null for a repository read anonymously (public, or no App on this server), or why GitHub
 * refused one. The caller revokes it (`github.revokeInstallationToken`) once done.
 */
export async function repositoryToken(
  userId: number,
  repositoryUrl: string,
): Promise<{ github: GithubApi; token: string } | null | GithubFailure> {
  const config = await githubAppConfig()
  if (!config) return null
  const grant = await findGrant(userId, repositoryUrl)
  if (!grant) return null
  const github = await app.container.make(GithubApi)
  const token = await github.installationToken(config, grant.installationId, grant.repositoryId)
  return token.ok ? { github, token: token.value } : token.failure
}

/** Which flow made an installation token: what a failed revocation is logged with. */
export const TokenFlow = {
  /** The assistant's repository sandbox (`RepositorySession`). */
  Assistant: 'assistant',
  /** The source of a drawing or a review (`readSource`). */
  Source: 'source',
  /** A GitHub code map import (`ImportGithubCodeMapJob`). */
  Import: 'import',
} as const
export type TokenFlow = (typeof TokenFlow)[keyof typeof TokenFlow]

/** The reason logged when the revocation threw instead of answering. */
const REVOCATION_THREW = 'exception'

/**
 * Revokes an installation token. When GitHub does not confirm it, logs one line holding the
 * flow and the reason only (GitHub's `GithubFailure`, or `exception`), never the token nor
 * anything GitHub answered: the token stays valid until it expires (one hour). Never throws.
 */
export async function revokeToken(
  access: { github: GithubApi; token: string },
  flow: TokenFlow,
): Promise<void> {
  const reason = await access.github.revokeInstallationToken(access.token).then(
    (result) => (result.ok ? null : result.failure),
    () => REVOCATION_THREW,
  )
  if (reason) logger.warn({ flow, reason }, 'installation token not revoked')
}

/**
 * Revokes the token of `access` on the first call only: right after the clone it was made for,
 * then again on every way out, which does nothing more. Never throws.
 */
export function revokeOnce(
  access: { github: GithubApi; token: string } | null,
  flow: TokenFlow,
): () => Promise<void> {
  let done = access === null
  return async () => {
    if (done || !access) return
    done = true
    await revokeToken(access, flow)
  }
}

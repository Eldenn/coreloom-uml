import app from '@adonisjs/core/services/app'
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

import db from '@adonisjs/lucid/services/db'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import type { GithubConnection } from '#app/github/services/github-api'
import type User from '#app/users/models/user'

/**
 * The repositories a user reads through the GitHub App. A connection replaces them all with what
 * GitHub lists for the user; webhooks remove what GitHub took away in between.
 */

/** Replaces the user's grants with the connection's repositories. */
export async function replaceGrants(user: User, connection: GithubConnection): Promise<void> {
  await db.transaction(async (trx) => {
    await GithubRepositoryGrant.query({ client: trx }).where('userId', user.id).delete()
    if (connection.repositories.length === 0) return
    await GithubRepositoryGrant.createMany(
      connection.repositories.map((repository) => ({
        userId: user.id,
        githubUserId: connection.user.id,
        githubLogin: connection.user.login,
        installationId: repository.installationId,
        repositoryId: repository.repositoryId,
        owner: repository.owner,
        name: repository.name,
        private: repository.private,
        defaultBranch: repository.defaultBranch,
      })),
      { client: trx },
    )
  })
}

/** The user's grant on a repository, by its URL (GitHub names are case-insensitive). */
export async function findGrant(
  userId: number,
  repositoryUrl: string,
): Promise<GithubRepositoryGrant | null> {
  const repository = parseGithubRepository(repositoryUrl)
  if (!repository) return null
  return GithubRepositoryGrant.query()
    .where('userId', userId)
    .whereRaw('lower(owner) = ?', [repository.owner.toLowerCase()])
    .whereRaw('lower(name) = ?', [repository.name.toLowerCase()])
    .first()
}

export function findGrantById(
  userId: number,
  repositoryId: number,
): Promise<GithubRepositoryGrant | null> {
  return GithubRepositoryGrant.query()
    .where('userId', userId)
    .where('repositoryId', repositoryId)
    .first()
}

export function listGrants(userId: number): Promise<GithubRepositoryGrant[]> {
  return GithubRepositoryGrant.query()
    .where('userId', userId)
    .orderByRaw('lower(owner), lower(name)')
}

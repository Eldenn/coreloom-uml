import type GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import type {
  GithubConnectionOutput,
  GithubRepositoryOutput,
} from '#app/github/validators/github-output'

export function serializeGithubRepository(grant: GithubRepositoryGrant): GithubRepositoryOutput {
  return {
    id: grant.repositoryId,
    owner: grant.owner,
    name: grant.name,
    url: grant.url,
    private: grant.private,
    defaultBranch: grant.defaultBranch,
  }
}

export function serializeGithubConnection(
  available: boolean,
  grants: GithubRepositoryGrant[],
): GithubConnectionOutput {
  return {
    available,
    login: grants[0]?.githubLogin ?? null,
    repositories: grants.map(serializeGithubRepository),
  }
}

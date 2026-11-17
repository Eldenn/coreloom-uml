import { createHmac, timingSafeEqual } from 'node:crypto'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { isValidBranch } from '#app/code-maps/services/github-repository'
import { GithubEvent } from '#app/github/constants/github'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import FollowGithubPushJob from '#app/jobs/follow-github-push_job'

/**
 * What the GitHub App's webhook does with a delivery whose signature checked: pushes on a
 * followed repository are queued (`FollowGithubPushJob`), and grants GitHub took away are
 * deleted. Anything else is acknowledged and ignored. A delivery is untrusted beyond its
 * signature: only ids, a branch name and a commit are read from it, each checked.
 */

/** `X-Hub-Signature-256`: `sha256=` + the HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyGithubSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false
  const given = Buffer.from(header.slice('sha256='.length), 'hex')
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  return given.length === expected.length && timingSafeEqual(given, expected)
}

type Payload = Record<string, unknown>

/** What the delivery led to, for the log line. */
export type DeliveryOutcome = 'ignored' | 'queued' | 'revoked'

export async function handleGithubDelivery(
  event: string | undefined,
  payload: Payload,
): Promise<DeliveryOutcome> {
  const action = typeof payload.action === 'string' ? payload.action : null
  switch (event) {
    case GithubEvent.Push:
      return handlePush(payload)
    case GithubEvent.Installation: {
      // Uninstalled: none of its repositories can be read any more. A suspension is reversible:
      // the token is refused meanwhile, which fails the import with a clear reason.
      const id = idOf(payload.installation)
      if (action !== 'deleted' || id === null) return 'ignored'
      await GithubRepositoryGrant.query().where('installationId', id).delete()
      return 'revoked'
    }
    case GithubEvent.InstallationRepositories: {
      const id = idOf(payload.installation)
      const removed = Array.isArray(payload.repositories_removed)
        ? payload.repositories_removed.map(idOf).filter((value) => value !== null)
        : []
      if (action !== 'removed' || id === null || removed.length === 0) return 'ignored'
      await GithubRepositoryGrant.query()
        .where('installationId', id)
        .whereIn('repositoryId', removed)
        .delete()
      return 'revoked'
    }
    case GithubEvent.AppAuthorization: {
      // The user revoked the App's authorization on GitHub: forget what they connected.
      const id = idOf(payload.sender)
      if (action !== 'revoked' || id === null) return 'ignored'
      await GithubRepositoryGrant.query().where('githubUserId', id).delete()
      return 'revoked'
    }
    default:
      return 'ignored'
  }
}

async function handlePush(payload: Payload): Promise<DeliveryOutcome> {
  if (payload.deleted === true) return 'ignored'
  const ref = typeof payload.ref === 'string' ? payload.ref : ''
  if (!ref.startsWith('refs/heads/')) return 'ignored'
  const branch = ref.slice('refs/heads/'.length)
  const repository = payload.repository as Payload | undefined
  const repositoryId = idOf(repository)
  const defaultBranch =
    typeof repository?.default_branch === 'string' ? repository.default_branch : null
  const commit = typeof payload.after === 'string' ? payload.after : ''
  if (
    repositoryId === null ||
    !isValidBranch(branch) ||
    (defaultBranch !== null && !isValidBranch(defaultBranch)) ||
    !/^[0-9a-f]{40,64}$/.test(commit)
  ) {
    return 'ignored'
  }
  // Most pushes concern no project: nothing is queued for them.
  const followed = await GithubCodeMapFollow.query().where('repositoryId', repositoryId).first()
  if (!followed) return 'ignored'
  await FollowGithubPushJob.dispatch({ repositoryId, branch, defaultBranch, commit })
  return 'queued'
}

function idOf(value: unknown): number | null {
  const id = (value as { id?: unknown } | null | undefined)?.id
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null
}

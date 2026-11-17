import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { CODE_MAPS_QUEUE, CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { startGithubImport } from '#app/code-maps/services/github-import'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { findGrantById } from '#app/github/services/github-grants'
import User from '#app/users/models/user'

export type FollowGithubPushJobData = {
  repositoryId: number
  branch: string
  /** The repository's default branch, for the projects that follow it (`branch` null). */
  defaultBranch: string | null
  commit: string
}

/**
 * A push on a repository some projects follow (`POST /github/webhook`): each project following
 * that branch, whose owner still reaches the repository through the GitHub App, gets a new
 * `pending` map read by `ImportGithubCodeMapJob`. It runs on the code maps queue, one job at a
 * time, so an import started by an earlier push has finished by then. A project whose newest map
 * is already at this commit, or that has a map waiting to be read (it will read the newest
 * commit), is left alone. No token here: the import job makes one when it clones.
 */
export default class FollowGithubPushJob extends Job<FollowGithubPushJobData, void> {
  static defaultQueue = CODE_MAPS_QUEUE

  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  }

  async process(): Promise<void> {
    if (!(await githubAppConfig())) return
    const { repositoryId, branch, defaultBranch, commit } = this.data
    const follows = await GithubCodeMapFollow.query().where('repositoryId', repositoryId)
    for (const follow of follows) {
      if ((follow.branch ?? defaultBranch) !== branch) continue
      const user = await User.find(follow.userId)
      if (!user || !(await codeMapsEnabled(user))) continue
      const grant = await findGrantById(user.id, repositoryId)
      if (!grant) {
        this.logger.info({ projectId: follow.projectId }, 'Followed repository no longer reachable')
        continue
      }
      const newest = await CodeMap.query()
        .where('projectId', follow.projectId)
        .orderBy('createdAt', 'desc')
        .orderBy('id', 'desc')
        .first()
      if (newest?.status === CodeMapStatus.Ready && newest.commitSha === commit) continue
      if (follow.repositoryUrl !== grant.url) {
        // Renamed or moved on GitHub: the new name is what the clone needs.
        follow.repositoryUrl = grant.url
        await follow.save()
      }
      const started = await startGithubImport({
        projectId: follow.projectId,
        userId: user.id,
        repositoryUrl: grant.url,
        branch: follow.branch,
      })
      this.logger.info(
        { projectId: follow.projectId, codeMapId: started?.id ?? null, commit },
        started
          ? 'Followed repository pushed: map queued'
          : 'Followed repository pushed: a map is already being read',
      )
    }
  }
}

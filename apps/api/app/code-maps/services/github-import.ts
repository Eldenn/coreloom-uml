import db from '@adonisjs/lucid/services/db'
import { GRAPHIFY_TESTED_VERSION } from '@coreloom-uml/codemap'
import { DateTime } from 'luxon'
import {
  CodeMapSource,
  CodeMapStatus,
  GITHUB_EXTRACTOR,
  GITHUB_IMPORT_FAILURES,
  GITHUB_IMPORT_LIMITS,
} from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import { pruneCodeMaps } from '#app/code-maps/services/code-map-pruning'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'

/**
 * Starts reading a GitHub repository into a new `pending` map of a project, for a request
 * (`POST /projects/:id/code-maps/github`) or a push the project follows (`FollowGithubPushJob`).
 * Returns null while the project already has a map being read: one extraction at a time.
 */
export async function startGithubImport(input: {
  projectId: number
  userId: number
  repositoryUrl: string
  branch: string | null
}): Promise<CodeMap | null> {
  const result = await db.transaction(async (trx) => {
    // One extraction at a time per project: the lock serializes two clicks, or a click and a push.
    await trx.from('projects').where('id', input.projectId).forUpdate().first()
    // A map still being read long after any job could have finished (no worker running, a
    // queue lost with Redis) is failed, so that it does not block the project for good.
    await CodeMap.query({ client: trx })
      .where('projectId', input.projectId)
      .whereIn('status', [CodeMapStatus.Pending, CodeMapStatus.Running])
      .where(
        'updatedAt',
        '<',
        DateTime.now().minus({ minutes: GITHUB_IMPORT_LIMITS.staleMinutes }).toSQL(),
      )
      .update({
        status: CodeMapStatus.Failed,
        failureReason: GITHUB_IMPORT_FAILURES.stale,
        updatedAt: DateTime.now().toSQL(),
      })
    const running = await CodeMap.query({ client: trx })
      .where('projectId', input.projectId)
      .whereIn('status', [CodeMapStatus.Pending, CodeMapStatus.Running])
      .first()
    if (running) return null
    const created = await CodeMap.create(
      {
        projectId: input.projectId,
        userId: input.userId,
        source: CodeMapSource.Github,
        repositoryUrl: input.repositoryUrl,
        branch: input.branch,
        commitSha: null,
        extractor: GITHUB_EXTRACTOR,
        extractorVersion: GRAPHIFY_TESTED_VERSION,
        status: CodeMapStatus.Pending,
        failureReason: null,
        nodeCount: 0,
        edgeCount: 0,
        storageKey: null,
      },
      { client: trx },
    )
    return { codeMap: created, dropped: await pruneCodeMaps(input.projectId, trx) }
  })
  if (!result) return null
  await deleteCodeMapFiles(result.dropped)

  try {
    await ImportGithubCodeMapJob.dispatch({ codeMapId: result.codeMap.id })
  } catch (error) {
    await result.codeMap.delete()
    throw error
  }
  return result.codeMap
}

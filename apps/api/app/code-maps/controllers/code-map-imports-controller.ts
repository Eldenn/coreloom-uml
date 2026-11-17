import type { HttpContext } from '@adonisjs/core/http'
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
import { serializeCodeMap } from '#app/code-maps/serializers/code-map-serializer'
import { analyzerUrl } from '#app/code-maps/services/code-map-analyzer'
import { pruneCodeMaps } from '#app/code-maps/services/code-map-pruning'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { parseGithubRepository } from '#app/code-maps/services/github-repository'
import { importGithubCodeMapInput } from '#app/code-maps/validators/code-maps-input'
import ImportGithubCodeMapJob from '#app/jobs/import-github-code-map_job'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

export const GITHUB_IMPORT_OFF = {
  error: { message: 'Importing from GitHub is not set up on this server.' },
} as const
export const GITHUB_IMPORT_RUNNING = {
  error: { message: 'A repository is already being read for this project.' },
} as const

/**
 * Code maps the server extracts itself, from a public GitHub repository: the map is created
 * `pending` and `ImportGithubCodeMapJob` has the analyzer service clone and read it. Owner-scoped,
 * behind the `code-maps` flag (404 while off).
 */
export default class CodeMapImportsController {
  /**
   * `POST /projects/:id/code-maps/github` `{ url, branch? }`: 202 with the pending map, which the
   * client polls (`GET /code-maps/:id`) until it is `ready` or `failed`. One extraction per
   * project at a time (409); 503 when the server has no analyzer.
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const { url, branch } = await request.validateUsing(importGithubCodeMapInput)
    if (!analyzerUrl()) return response.serviceUnavailable(GITHUB_IMPORT_OFF)
    // The validator accepted it, so it parses; checked again for the type only.
    const repository = parseGithubRepository(url)
    if (!repository)
      return response.unprocessableEntity({ error: { message: 'Not a GitHub repository' } })

    const result = await db.transaction(async (trx) => {
      // One extraction at a time per project: the lock serializes two clicks.
      await trx.from('projects').where('id', project.id).forUpdate().first()
      // A map still being read long after any job could have finished (no worker running, a
      // queue lost with Redis) is failed, so that it does not block the project for good.
      await CodeMap.query({ client: trx })
        .where('projectId', project.id)
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
        .where('projectId', project.id)
        .whereIn('status', [CodeMapStatus.Pending, CodeMapStatus.Running])
        .first()
      if (running) return null
      const created = await CodeMap.create(
        {
          projectId: project.id,
          userId: user.id,
          source: CodeMapSource.Github,
          repositoryUrl: repository.url,
          branch: branch ?? null,
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
      return { codeMap: created, dropped: await pruneCodeMaps(project.id, trx) }
    })
    if (!result) return response.conflict(GITHUB_IMPORT_RUNNING)
    await deleteCodeMapFiles(result.dropped)

    try {
      await ImportGithubCodeMapJob.dispatch({ codeMapId: result.codeMap.id })
    } catch (error) {
      await result.codeMap.delete()
      throw error
    }

    return response.accepted({ codeMap: serializeCodeMap(result.codeMap) })
  }
}

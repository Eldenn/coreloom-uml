import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { detectEntryPoints, summarizeCodeMap } from '@coreloom-uml/codemap'
import { CODE_MAP_LIMITS, CodeMapSource, CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import { serializeCodeMap } from '#app/code-maps/serializers/code-map-serializer'
import {
  deleteCodeMapFiles,
  readCodeMapFile,
  storeCodeMapFile,
} from '#app/code-maps/services/code-map-storage'
import { readUploadedCodeMap } from '#app/code-maps/services/code-map-upload'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import { createCodeMapInput, listCodeMapsInput } from '#app/code-maps/validators/code-maps-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * The code maps of the caller's projects: owner-scoped (a map that isn't yours reads as 404),
 * behind the `code-maps` flag (404 while off). No model is ever called here.
 */
export default class CodeMapsController {
  /** `GET /projects/:id/code-maps`, newest first. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { page, perPage } = await request.validateUsing(listCodeMapsInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const query = CodeMap.query()
      .where('projectId', project.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')

    return response.ok(await paginate(query, { page, perPage }, serializeCodeMap))
  }

  /**
   * `POST /projects/:id/code-maps`: a multipart `file`, graphify's `graph.json` or a map the CLI
   * normalized, plain or gzipped. Checked before anything is stored (422 otherwise), stored
   * gzipped in Drive; the project keeps its `CODE_MAP_LIMITS.perProject` newest maps.
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const { file, repositoryUrl, branch, commitSha } =
      await request.validateUsing(createCodeMapInput)
    const result = await readUploadedCodeMap(file, {
      repository: repositoryUrl,
      branch,
      commit: commitSha,
    })
    if (!result.ok) {
      return response.unprocessableEntity({
        error: { message: 'The code map was refused', problems: result.problems },
      })
    }

    const { header } = result.map
    const storageKey = await storeCodeMapFile(project.id, result.map)
    let codeMap: CodeMap
    let dropped: (string | null)[]
    try {
      ;({ codeMap, dropped } = await db.transaction(async (trx) => {
        const created = await CodeMap.create(
          {
            projectId: project.id,
            userId: user.id,
            source: auth.authenticatedViaGuard === 'api' ? CodeMapSource.Cli : CodeMapSource.Upload,
            repositoryUrl: webUrl(repositoryUrl ?? header.repository),
            branch: header.branch ?? null,
            commitSha: header.commit ?? null,
            extractor: header.extractor.name,
            extractorVersion: header.extractor.version,
            status: CodeMapStatus.Ready,
            failureReason: null,
            nodeCount: header.nodeCount,
            edgeCount: header.edgeCount,
            storageKey,
          },
          { client: trx },
        )
        const older = await CodeMap.query({ client: trx })
          .where('projectId', project.id)
          .orderBy('createdAt', 'desc')
          .orderBy('id', 'desc')
          .offset(CODE_MAP_LIMITS.perProject)
        await CodeMap.query({ client: trx })
          .whereIn(
            'id',
            older.map((row) => row.id),
          )
          .delete()
        return { codeMap: created, dropped: older.map((row) => row.storageKey) }
      }))
    } catch (error) {
      await deleteCodeMapFiles([storageKey])
      throw error
    }
    await deleteCodeMapFiles(dropped)

    return response.created({ codeMap: serializeCodeMap(codeMap) })
  }

  /** `GET /code-maps/:id`: the header, plus the summary when the map is ready. */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)

    const summary =
      codeMap.status === CodeMapStatus.Ready && codeMap.storageKey
        ? summarizeCodeMap(detectEntryPoints(await readCodeMapFile(codeMap.storageKey)))
        : null

    return response.ok({ codeMap: { ...serializeCodeMap(codeMap), summary } })
  }

  /** `DELETE /code-maps/:id`, with its file. The diagrams' links stay: they outlive maps. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)

    await codeMap.delete()
    await deleteCodeMapFiles([codeMap.storageKey])

    return response.noContent()
  }
}

/**
 * The repository's web address, without any user name or password it carried (a clone URL may
 * hold a token). Null when it is not an http(s) address.
 */
function webUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    url.username = ''
    url.password = ''
    const clean = url.toString()
    return clean.length <= CODE_MAP_LIMITS.repositoryUrl ? clean : null
  } catch {
    return null
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import type CodeMap from '#app/code-maps/models/code-map'
import { codeConformance, latestReadyCodeMap } from '#app/code-maps/services/code-conformance'
import { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import { showCodeConformanceInput } from '#app/code-maps/validators/code-maps-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'

/**
 * How a project's diagrams line up with its code, for a check in CI (`coreloom-uml check
 * --conformance`): the deterministic match of each diagram against a map, its findings weighed.
 * No model is called, nothing is stored.
 */
export default class CodeMapConformanceController {
  /** `GET /projects/:id/code-maps/conformance?codeMapId=` */
  async show({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { codeMapId } = await request.validateUsing(showCodeConformanceInput)
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    let codeMap: CodeMap | null
    if (codeMapId === undefined) {
      codeMap = await latestReadyCodeMap(project.id)
      if (!codeMap) {
        return response.conflict({ error: { message: 'No code map is ready in this project' } })
      }
    } else {
      codeMap = await findOwnedCodeMap(codeMapId, user)
      if (!codeMap || codeMap.projectId !== project.id) {
        return response.notFound(CODE_MAP_NOT_FOUND)
      }
      if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
        return response.conflict({ error: { message: 'This code map is not ready' } })
      }
    }

    const map = await readDetectedCodeMap(codeMap.storageKey as string)
    return response.ok(await codeConformance(codeMap, map, user))
  }
}

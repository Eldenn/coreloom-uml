import type { HttpContext } from '@adonisjs/core/http'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import {
  matchDiagrams,
  projectDiagrams,
  undocumentedProcesses,
} from '#app/code-maps/services/code-conformance'
import { readCodeMapFile } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'

/**
 * The processes no diagram of the project documents: the calls followed from each entry point
 * (route, job, command, handler) that touch no code linked to a diagram element. Deterministic,
 * no model is called.
 */
export default class CodeMapProcessesController {
  /** `GET /code-maps/:id/processes` */
  async index({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict({ error: { message: 'This code map is not ready' } })
    }

    const map = await readCodeMapFile(codeMap.storageKey)
    const matches = await matchDiagrams(await projectDiagrams(codeMap.projectId, user), map)
    return response.ok(undocumentedProcesses(codeMap, map, matches))
  }
}

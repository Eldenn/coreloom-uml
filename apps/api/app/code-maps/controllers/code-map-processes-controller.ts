import type { HttpContext } from '@adonisjs/core/http'
import { findUncoveredFlows, linkedCodeKeys } from '@coreloom-uml/codemap'
import Architecture from '#app/architectures/models/architecture'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import { readCodeMapFile } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { matchStoredDiagram } from '#app/code-maps/services/diagram-code-links'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import type { CodeMapProcessesOutput } from '#app/code-maps/validators/code-maps-output'

/** Flows listed, largest first; the rest are counted in `total`. */
const MAX_PROCESSES = 50
/** Nodes listed per flow, in the order the calls reach them. */
const MAX_NODES = 25

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
    const architectures = await Architecture.query()
      .where('projectId', codeMap.projectId)
      .where('userId', user.id)
      .preload('diagrams')
    const diagrams = architectures.flatMap((architecture) => architecture.diagrams)
    const links = diagrams.length
      ? await DiagramCodeLink.query().whereIn(
          'diagramId',
          diagrams.map((diagram) => diagram.id),
        )
      : []
    const matches = diagrams.map((diagram) =>
      matchStoredDiagram(
        diagram,
        map,
        links.filter((link) => link.diagramId === diagram.id),
      ),
    )
    const flows = findUncoveredFlows(map, linkedCodeKeys(matches))

    const output: CodeMapProcessesOutput = {
      codeMapId: codeMap.id,
      total: flows.length,
      processes: flows.slice(0, MAX_PROCESSES).map((flow) => ({
        entry: flow.entry,
        entryKind: flow.entryKind,
        size: flow.nodes.length,
        depth: flow.depth,
        folders: flow.folders,
        nodes: flow.nodes.slice(0, MAX_NODES),
      })),
    }
    return response.ok(output)
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import type CodeMap from '#app/code-maps/models/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import { serializeDiagramCodeLink } from '#app/code-maps/serializers/code-map-serializer'
import { readCodeMapFile } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import {
  DIAGRAM_NOT_FOUND,
  diagramLinks,
  findMatchableDiagram,
  matchStoredDiagram,
} from '#app/code-maps/services/diagram-code-links'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import {
  showCodeMapLinksInput,
  updateCodeMapLinksInput,
} from '#app/code-maps/validators/code-maps-input'
import type { CodeMapLinksOutput } from '#app/code-maps/validators/code-maps-output'
import type Diagram from '#app/diagrams/models/diagram'

const MAP_NOT_READY = { error: { message: 'This code map is not ready' } } as const

/**
 * How one diagram of the project lines up with a code map: the owner's stored links and the
 * deterministic match (`matchDiagram`) they lead to. No model is called.
 */
export default class CodeMapLinksController {
  /** `GET /code-maps/:id/links?diagramId=` */
  async show({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { diagramId } = await request.validateUsing(showCodeMapLinksInput)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    const diagram = await findMatchableDiagram(diagramId, codeMap, user)
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict(MAP_NOT_READY)
    }

    return response.ok(await linksOutput(codeMap, diagram, await diagramLinks(diagram)))
  }

  /**
   * `PUT /code-maps/:id/links?diagramId=`: replaces the diagram's links with `links` (an empty
   * list clears them), then answers with the new match.
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { diagramId, links } = await request.validateUsing(updateCodeMapLinksInput)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    const diagram = await findMatchableDiagram(diagramId, codeMap, user)
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict(MAP_NOT_READY)
    }

    const seen = new Set<string>()
    for (const link of links) {
      const pair = JSON.stringify([link.elementId, link.codeKey])
      if (seen.has(pair)) {
        return response.unprocessableEntity({
          error: { message: `The link ${link.elementId} → ${link.codeKey} is listed twice` },
        })
      }
      seen.add(pair)
    }

    const stored = await db.transaction(async (trx) => {
      await DiagramCodeLink.query({ client: trx }).where('diagramId', diagram.id).delete()
      if (links.length > 0) {
        await DiagramCodeLink.createMany(
          links.map((link) => ({ diagramId: diagram.id, ...link })),
          { client: trx },
        )
      }
      return diagramLinks(diagram, trx)
    })

    return response.ok(await linksOutput(codeMap, diagram, stored))
  }
}

async function linksOutput(
  codeMap: CodeMap,
  diagram: Diagram,
  links: DiagramCodeLink[],
): Promise<CodeMapLinksOutput> {
  const map = await readCodeMapFile(codeMap.storageKey as string)
  return {
    codeMapId: codeMap.id,
    diagramId: diagram.id,
    links: links.map(serializeDiagramCodeLink),
    match: matchStoredDiagram(diagram, map, links),
  }
}

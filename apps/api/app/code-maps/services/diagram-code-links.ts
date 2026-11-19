import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { type CodeMap, type DiagramMatch, matchDiagram } from '@coreloom-uml/codemap'
import type { DiagramCodeLinkStatus } from '#app/code-maps/constants/code-map'
import type CodeMapModel from '#app/code-maps/models/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import Diagram from '#app/diagrams/models/diagram'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const DIAGRAM_NOT_FOUND = { error: { message: 'Diagram not found' } } as const

/**
 * The diagram with this id if `user` owns it and it is in the map's project, else null: a
 * diagram is only ever matched against a map of its own project.
 */
export async function findMatchableDiagram(
  diagramId: number,
  codeMap: CodeMapModel,
  user: User,
): Promise<Diagram | null> {
  const diagram = await Diagram.query().where('id', diagramId).preload('architecture').first()
  if (!diagram || !assertOwner(diagram.architecture, user)) return null
  if (diagram.architecture.projectId !== codeMap.projectId) return null
  return diagram
}

export function diagramLinks(diagram: Diagram, client?: TransactionClientContract) {
  return DiagramCodeLink.query({ client })
    .where('diagramId', diagram.id)
    .orderBy('elementId', 'asc')
    .orderBy('codeKey', 'asc')
}

/** Matches the diagram against the map; an empty diagram matches nothing. */
export function matchStoredDiagram(
  diagram: Diagram,
  map: CodeMap,
  links: readonly DiagramCodeLink[],
): DiagramMatch {
  if (!diagram.content) return { elements: [], relations: [], findings: [] }
  return matchDiagram(
    diagram.content,
    map,
    links.map(({ elementId, codeKey, status }) => ({ elementId, codeKey, status })),
  )
}

export type LinkInput = { elementId: string; codeKey: string; status: DiagramCodeLinkStatus }

/** The same element and code key, as one text. */
export const linkPair = (link: { elementId: string; codeKey: string }) =>
  JSON.stringify([link.elementId, link.codeKey])

/** The first link listed twice (same element and code key), or null. */
export function duplicateLink<T extends { elementId: string; codeKey: string }>(
  links: readonly T[],
): T | null {
  const seen = new Set<string>()
  for (const link of links) {
    if (seen.has(linkPair(link))) return link
    seen.add(linkPair(link))
  }
  return null
}

/**
 * `PUT /code-maps/:id/links`: replaces the diagram's links with `links`, all of them (none
 * listed twice), in `client` or a transaction of its own. Answers the links now stored.
 */
export async function replaceDiagramLinks(
  diagram: Diagram,
  links: readonly LinkInput[],
  client?: TransactionClientContract,
): Promise<DiagramCodeLink[]> {
  const write = async (trx: TransactionClientContract) => {
    await DiagramCodeLink.query({ client: trx }).where('diagramId', diagram.id).delete()
    if (links.length > 0) {
      await DiagramCodeLink.createMany(
        links.map((link) => ({ diagramId: diagram.id, ...link })),
        { client: trx },
      )
    }
    return diagramLinks(diagram, trx)
  }
  return client ? write(client) : db.transaction(write)
}

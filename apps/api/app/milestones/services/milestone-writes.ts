import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { UmlProblem } from '@coreloom-uml/uml'
import Architecture from '#app/architectures/models/architecture'
import { checkDiagramValue } from '#app/diagrams/services/diagram-content'
import { touchArchitecture } from '#app/diagrams/services/owned-diagram'
import { MILESTONES_PER_ARCHITECTURE_MAX } from '#app/milestones/constants/milestone'
import Milestone from '#app/milestones/models/milestone'

export const MILESTONE_NOT_FOUND = { error: { message: 'Milestone not found' } } as const
export const MILESTONES_FULL = {
  error: {
    message: `An architecture keeps at most ${MILESTONES_PER_ARCHITECTURE_MAX} milestones. Delete one first.`,
  },
} as const

/** The milestone with this id if it belongs to `architecture` (already checked as owned). */
export function findArchitectureMilestone(
  architecture: Architecture,
  milestoneId: number,
): Promise<Milestone | null> {
  return Milestone.query().where('architectureId', architecture.id).where('id', milestoneId).first()
}

/** The architecture row, locked until the transaction ends: no save interleaves with a milestone. */
function lockArchitecture(id: number, trx: TransactionClientContract) {
  return Architecture.query({ client: trx }).where('id', id).forUpdate().firstOrFail()
}

/** Keeps the architecture's views as they are now under `name`; `full` at the limit. */
export function createMilestone(owned: Architecture, name: string): Promise<Milestone | 'full'> {
  return db.transaction(async (trx) => {
    const architecture = await lockArchitecture(owned.id, trx)
    const kept = await Milestone.query({ client: trx })
      .where('architectureId', architecture.id)
      .count('* as total')
    if (Number(kept[0]?.$extras.total) >= MILESTONES_PER_ARCHITECTURE_MAX) return 'full'

    const diagrams = await architecture.related('diagrams').query().orderBy('position', 'asc')
    return Milestone.create(
      {
        architectureId: architecture.id,
        userId: architecture.userId,
        name,
        diagrams: diagrams.map((diagram) => ({
          diagramId: diagram.id,
          title: diagram.title,
          kind: diagram.kind,
          format: diagram.format,
          content: diagram.content,
          position: diagram.position,
        })),
        diagramCount: diagrams.length,
      },
      { client: trx },
    )
  })
}

/**
 * Puts the architecture back as the milestone keeps it: a view that still exists takes its kept
 * title, content and place (its id, and so its links, stay), one deleted since is created again,
 * and one added since is deleted. The kept content is checked like any save first: the problems
 * are answered and nothing is written when a view no longer reads.
 */
export async function restoreMilestone(
  owned: Architecture,
  milestone: Milestone,
): Promise<Architecture | { problems: UmlProblem[] }> {
  for (const kept of milestone.diagrams) {
    if (kept.content === null) continue
    const checked = checkDiagramValue(kept.content)
    if (!checked.diagram) return { problems: checked.problems }
  }

  return db.transaction(async (trx) => {
    const architecture = await lockArchitecture(owned.id, trx)
    const current = await architecture.related('diagrams').query().forUpdate()
    const byId = new Map(current.map((diagram) => [diagram.id, diagram]))

    for (const { diagramId, ...fields } of milestone.diagrams) {
      const diagram = byId.get(diagramId)
      byId.delete(diagramId)
      if (!diagram) {
        await architecture.related('diagrams').create({ ...fields, version: 1 })
        continue
      }
      // A new version: an editor still open on the older one meets a conflict, not a silent loss.
      diagram.merge({ ...fields, version: diagram.version + 1 })
      await diagram.save()
    }
    for (const added of byId.values()) await added.delete()

    await touchArchitecture(architecture)
    await architecture.load('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
    return architecture
  })
}

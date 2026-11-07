import { DateTime } from 'luxon'
import type Architecture from '#app/architectures/models/architecture'
import type Diagram from '#app/diagrams/models/diagram'

export const DIAGRAM_NOT_FOUND = { error: { message: 'Diagram not found' } } as const

export const DIAGRAM_CHANGED = {
  message: 'This diagram was changed somewhere else.',
} as const

/** The diagram with this id if it belongs to `architecture` (already checked as owned). */
export function findArchitectureDiagram(
  architecture: Architecture,
  diagramId: number,
): Promise<Diagram | null> {
  return architecture.related('diagrams').query().where('id', diagramId).first()
}

/** A change to a diagram is a change to its architecture (the date visitors see, RM-26). */
export async function touchArchitecture(architecture: Architecture) {
  architecture.updatedAt = DateTime.now()
  await architecture.save()
}

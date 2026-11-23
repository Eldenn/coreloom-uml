import type { DecisionPartRef } from '#app/decisions/constants/decision'
import type Decision from '#app/decisions/models/decision'
import type { DecisionOutput } from '#app/decisions/validators/decisions-output'

/** Expects `requirements`, `diagrams` and `parts` loaded (`withLinks`). */
export function serializeDecision(decision: Decision): DecisionOutput {
  return {
    id: decision.id,
    projectId: decision.projectId,
    title: decision.title,
    context: decision.context,
    options: decision.options,
    chosen: decision.chosen,
    consequences: decision.consequences,
    status: decision.status,
    supersededById: decision.supersededById,
    requirementIds: decision.requirements.map((requirement) => requirement.id).sort(byNumber),
    diagramIds: decision.diagrams.map((diagram) => diagram.id).sort(byNumber),
    parts: serializeParts(decision),
    origin: decision.origin,
    supersedesId: decision.supersedesId,
    createdAt: decision.createdAt.toISO() ?? '',
    updatedAt: decision.updatedAt.toISO() ?? '',
  }
}

const byNumber = (a: number, b: number) => a - b

/** The parts of views a decision names, as its outputs list them. */
export const serializeParts = (decision: Decision): DecisionPartRef[] =>
  decision.parts.map(({ diagramId, type, label }) => ({ diagramId, type, label }))

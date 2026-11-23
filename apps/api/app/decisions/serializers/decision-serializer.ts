import type Decision from '#app/decisions/models/decision'
import type { DecisionOutput } from '#app/decisions/validators/decisions-output'

/** Expects `requirements` and `diagrams` loaded (`withLinks`). */
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
    createdAt: decision.createdAt.toISO() ?? '',
    updatedAt: decision.updatedAt.toISO() ?? '',
  }
}

const byNumber = (a: number, b: number) => a - b

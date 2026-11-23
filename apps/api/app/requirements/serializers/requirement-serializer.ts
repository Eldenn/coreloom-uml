import type Requirement from '#app/requirements/models/requirement'
import type { RequirementOutput } from '#app/requirements/validators/requirements-output'

export function serializeRequirement(requirement: Requirement): RequirementOutput {
  return {
    id: requirement.id,
    projectId: requirement.projectId,
    category: requirement.category,
    priority: requirement.priority,
    statement: requirement.statement,
    measure: requirement.measure,
    createdAt: requirement.createdAt.toISO() ?? '',
    updatedAt: requirement.updatedAt.toISO() ?? '',
  }
}

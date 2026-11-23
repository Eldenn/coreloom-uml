import type Project from '#app/projects/models/project'
import {
  REQUIREMENT_LIMITS,
  type RequirementCategory,
  type RequirementPriority,
} from '#app/requirements/constants/requirement'
import Requirement from '#app/requirements/models/requirement'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const REQUIREMENT_NOT_FOUND = { error: { message: 'Requirement not found' } } as const
export const REQUIREMENTS_FULL = {
  error: { message: `A project holds at most ${REQUIREMENT_LIMITS.perProject} requirements.` },
} as const

export type RequirementFields = {
  category: RequirementCategory
  priority: RequirementPriority
  statement: string
  measure?: string | null
}

/** The requirement with this id if `user` owns it, else null: callers answer 404 either way. */
export async function findOwnedRequirement(id: number, user: User): Promise<Requirement | null> {
  const requirement = await Requirement.find(id)
  if (!requirement || !assertOwner(requirement, user)) return null
  return requirement
}

/** Adds a requirement to an owned project, or answers `full` at the project's limit. */
export async function createRequirement(
  project: Project,
  fields: RequirementFields,
): Promise<Requirement | 'full'> {
  const held = await Requirement.query().where('projectId', project.id).count('* as total')
  if (Number(held[0].$extras.total) >= REQUIREMENT_LIMITS.perProject) return 'full'
  return Requirement.create({
    projectId: project.id,
    userId: project.userId,
    category: fields.category,
    priority: fields.priority,
    statement: fields.statement,
    measure: fields.measure || null,
  })
}

/** Changes an owned requirement; omitted fields are left as is. */
export async function updateRequirement(
  requirement: Requirement,
  fields: Partial<RequirementFields>,
) {
  if (fields.category !== undefined) requirement.category = fields.category
  if (fields.priority !== undefined) requirement.priority = fields.priority
  if (fields.statement !== undefined) requirement.statement = fields.statement
  if (fields.measure !== undefined) requirement.measure = fields.measure || null
  await requirement.save()
  return requirement
}

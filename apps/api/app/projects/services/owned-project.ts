import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DEFAULT_PROJECT_NAME } from '#app/projects/constants/limits'
import Project from '#app/projects/models/project'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const PROJECT_NOT_FOUND = { error: { message: 'Project not found' } } as const

/**
 * The project with this id if `user` owns it, else null — callers answer 404
 * either way. `withCounts` loads how many artifacts it holds.
 */
export async function findOwnedProject(
  id: number,
  user: User,
  { withCounts = false } = {},
): Promise<Project | null> {
  const query = Project.query().where('id', id)
  if (withCounts) {
    query
      .withCount('architectures')
      .withCount('agentConfig', (counted) => counted.as('agent_configs_count'))
  }
  const project = await query.first()
  if (!project || !assertOwner(project, user)) return null
  return project
}

/**
 * Where an artifact created without naming its project goes: the user's
 * oldest project, created as "Default project" when they have none. Keeps
 * clients written before projects existed working.
 */
export async function defaultProjectFor(
  user: User,
  client?: TransactionClientContract,
): Promise<Project> {
  const existing = await Project.query({ client })
    .where('userId', user.id)
    .orderBy('id', 'asc')
    .first()
  if (existing) return existing
  return Project.create({ userId: user.id, name: DEFAULT_PROJECT_NAME }, { client })
}

import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Project from '#app/projects/models/project'
import type User from '#app/users/models/user'

/** The fields of a project a route or an accepted assistant action writes. */
export type ProjectFields = { name: string; description?: string | null }

/** Creates a project of `user`: the one code path of `POST /projects` and `create_project`. */
export function createProject(
  user: User,
  { name, description }: ProjectFields,
  client?: TransactionClientContract,
) {
  return Project.create({ userId: user.id, name, description: description ?? null }, { client })
}

/**
 * Changes an owned project (the caller found it with `findOwnedProject`); omitted fields are
 * left as is. The one code path of `PATCH /projects/:id` and `rename_project`.
 */
export async function updateProject(
  project: Project,
  fields: Partial<ProjectFields>,
  client?: TransactionClientContract,
) {
  if (client) project.useTransaction(client)
  if (fields.name !== undefined) project.name = fields.name
  if (fields.description !== undefined) project.description = fields.description
  await project.save()
  return project
}

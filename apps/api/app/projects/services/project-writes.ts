import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import CodeMap from '#app/code-maps/models/code-map'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'
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

/**
 * Deletes an owned project: its architectures go with it (cascade), and with them their diagrams
 * and share links; its agent conventions and code maps too. The one code path of
 * `DELETE /projects/:id` and `delete_project`. It answers the deletion of the code maps' files,
 * which the cascade cannot reach and nothing can roll back: run it once the row is gone for good
 * (after `client` commits).
 */
export async function deleteProject(
  project: Project,
  client?: TransactionClientContract,
): Promise<() => Promise<void>> {
  const codeMaps = await CodeMap.query({ client })
    .where('projectId', project.id)
    .select('storageKey')
  if (client) project.useTransaction(client)
  await project.delete()
  return () => deleteCodeMapFiles(codeMaps.map((codeMap) => codeMap.storageKey))
}

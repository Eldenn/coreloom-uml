import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Target } from '@coreloom-uml/catalog'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { projectHasAgentConfig } from '#app/agent-configs/services/owned-agent-config'
import Project from '#app/projects/models/project'
import { findOwnedProject } from '#app/projects/services/owned-project'
import type User from '#app/users/models/user'

/*
 * The writes of the agent conventions routes, shared with the assistant's accepted actions, which
 * run them inside their own transaction (`client`).
 */

/**
 * Locks the project row until the transaction ends, so two requests cannot both find it empty,
 * then tells whether another configuration than `exceptId` already sits in it.
 */
export async function lockProjectHasConfig(
  projectId: number,
  exceptId: number | undefined,
  trx: TransactionClientContract,
) {
  await Project.query({ client: trx }).where('id', projectId).forUpdate()
  return projectHasAgentConfig(projectId, exceptId, trx)
}

/** Blank notes are stored as none; omitted notes stay omitted. */
export function cleanNotes(notes: string | null | undefined) {
  return notes === undefined ? undefined : notes?.trim() ? notes : null
}

export type CreateAgentConfigFields = {
  name: string
  projectId?: number | null
  targets: Target[]
  notes?: string | null
}

/**
 * Creates agent conventions of `user`, in `projectId` when given (`POST /agent-configs`,
 * `create_agent_config`): `notFound` when that project is not the caller's, `conflict` when it
 * already holds a configuration.
 */
export async function createAgentConfig(
  user: User,
  { name, projectId, targets, notes }: CreateAgentConfigFields,
  client?: TransactionClientContract,
): Promise<{ notFound: true } | { conflict: true } | { config: AgentConfig }> {
  const project = projectId ? await findOwnedProject(projectId, user) : null
  if (projectId && !project) return { notFound: true }

  return (client ?? db).transaction(async (trx) => {
    if (project && (await lockProjectHasConfig(project.id, undefined, trx)))
      return { conflict: true }
    const config = await AgentConfig.create(
      {
        userId: user.id,
        projectId: project?.id ?? null,
        name,
        targets,
        notes: cleanNotes(notes) ?? null,
        revision: 1,
      },
      { client: trx },
    )
    return { config }
  })
}

/**
 * Deletes owned agent conventions: their ready-made rules, rules, roles and generations go with
 * them. The one code path of `DELETE /agent-configs/:id` and `delete_agent_config`.
 */
export async function deleteAgentConfig(config: AgentConfig, client?: TransactionClientContract) {
  if (client) config.useTransaction(client)
  await config.delete()
}

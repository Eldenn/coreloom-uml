import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Target } from '@coreloom-uml/catalog'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import {
  type MergeChoices,
  type MergeOutcome,
  type MergeSource,
  mergeSources,
} from '#app/agent-configs/services/agent-config-merge'
import {
  findOwnedAgentConfig,
  projectHasAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import Project from '#app/projects/models/project'
import { findOwnedProject } from '#app/projects/services/owned-project'
import { assertOwner } from '#app/shared/authorization/assert-owner'
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

export type UpdateAgentConfigFields = {
  name?: string
  projectId?: number | null
  targets?: Target[]
  notes?: string | null
}

/**
 * Changes owned agent conventions (`PATCH /agent-configs/:id`, `update_agent_config`): omitted
 * fields stay as they are, `projectId` moves them (null takes them out of their project). The
 * revision goes up only when what the files are rendered from changed (targets, notes).
 * `projectNotFound` when that project is not the caller's, `conflict` when it holds another.
 */
export async function updateAgentConfig(
  configId: number,
  user: User,
  input: UpdateAgentConfigFields,
  client?: TransactionClientContract,
): Promise<
  { notFound: true } | { projectNotFound: true } | { conflict: true } | { config: AgentConfig }
> {
  if (input.projectId && !(await findOwnedProject(input.projectId, user)))
    return { projectNotFound: true }
  const notes = cleanNotes(input.notes)

  return (client ?? db).transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return { notFound: true as const }
    config.useTransaction(trx)

    if (input.projectId !== undefined && input.projectId !== config.projectId) {
      if (input.projectId !== null && (await lockProjectHasConfig(input.projectId, config.id, trx)))
        return { conflict: true as const }
      config.projectId = input.projectId
    }
    if (input.name !== undefined) config.name = input.name

    const targets = input.targets ?? config.targets
    const changed =
      JSON.stringify(config.targets) !== JSON.stringify(targets) ||
      (notes !== undefined && notes !== config.notes)
    if (changed) {
      config.targets = targets
      if (notes !== undefined) config.notes = notes
      config.revision += 1
    }
    await config.save()
    return { config }
  })
}

/**
 * The caller's configurations named by `sourceIds`, in that order, as `mergeSources` reads them;
 * null when one is missing or not the caller's. Roles are read only while `agent-roles` is on.
 */
export async function mergeSourcesOf(
  user: User,
  sourceIds: number[],
  client?: TransactionClientContract,
): Promise<MergeSource[] | null> {
  const withRoles = await agentRolesEnabled(user)
  const rows = await AgentConfig.query({ client })
    .whereIn('id', sourceIds)
    .preload('readyRules', (query) => query.orderBy('id', 'asc'))
    .preload('rules', (query) => query.orderBy('position', 'asc').orderBy('id', 'asc'))
    .preload('roles', (query) => query.orderBy('id', 'asc'))
    .preload('skills', (query) => query.orderBy('id', 'asc'))
  const sources = sourceIds.flatMap((id) => rows.filter((row) => row.id === id))
  if (sources.length < sourceIds.length || !sources.every((row) => assertOwner(row, user)))
    return null
  return sources.map((source) => ({
    id: source.id,
    targets: source.targets,
    notes: source.notes,
    readyRules: source.readyRules,
    rules: source.rules,
    roles: withRoles ? source.roles.map((role) => role.toRole()) : [],
    skillIds: source.skills.map((row) => row.skillId),
  }))
}

/**
 * A new configuration made from several of the owner's, which stay as they are
 * (`POST /agent-configs/merge`, `merge_agent_configs`): outside any project, without a
 * generation. Nothing is created while a conflict has no choice or a limit is passed.
 */
export async function mergeAgentConfigs(
  user: User,
  input: { name: string; sourceIds: number[]; choices?: MergeChoices },
  client?: TransactionClientContract,
): Promise<
  { notFound: true } | Exclude<MergeOutcome, { merged: unknown }> | { config: AgentConfig }
> {
  return (client ?? db).transaction(async (trx) => {
    const sources = await mergeSourcesOf(user, input.sourceIds, trx)
    if (!sources) return { notFound: true as const }
    const outcome = mergeSources(sources, input.choices)
    if (!('merged' in outcome)) return outcome
    const { merged } = outcome

    const config = await AgentConfig.create(
      {
        userId: user.id,
        projectId: null,
        name: input.name,
        targets: merged.targets,
        notes: merged.notes,
        revision: 1,
      },
      { client: trx },
    )
    const agentConfigId = config.id
    await AgentConfigReadyRule.createMany(
      merged.readyRules.map((rule) => ({ ...rule, agentConfigId })),
      { client: trx },
    )
    await AgentConfigRule.createMany(
      merged.rules.map(({ section, text, source }, position) => ({
        agentConfigId,
        section,
        text,
        source,
        position,
      })),
      { client: trx },
    )
    await AgentConfigRole.createMany(
      merged.roles.map((role) => ({ ...role, agentConfigId })),
      { client: trx },
    )
    await AgentConfigSkill.createMany(
      merged.skillIds.map((skillId) => ({ skillId, agentConfigId })),
      { client: trx },
    )
    return { config }
  })
}

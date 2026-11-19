import { isDeepStrictEqual } from 'node:util'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { presetRole, ROLE_PRESETS, type Role, roleSchema } from '@coreloom-uml/catalog'
import { AGENT_ROLES_MAX } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import { currentInputs, inputsChecks } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  AGENT_ROLE_NOT_FOUND,
  bumpRevision,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { PgErrorCode } from '#app/shared/database/pg-error'
import type User from '#app/users/models/user'

/*
 * The writes of the role routes, shared with the assistant's accepted actions: each runs in one
 * transaction with the configuration locked (a savepoint of `client` when given), checks the whole
 * role with the catalog's `roleSchema`, and bumps the revision when something changed.
 */

type Refusal = { error: { message: string; problems?: string[] } }
type NotFound = typeof AGENT_CONFIG_NOT_FOUND | typeof AGENT_ROLE_NOT_FOUND
export type RoleOutcome =
  | { notFound: NotFound }
  | { refused: Refusal }
  /** The slug is another role's of the same configuration. */
  | { conflict: true }
  | { config: AgentConfig; role: AgentConfigRole }

/** A role's fields as the routes take them: the lists and `done` may be left out. */
export type RoleFields = Omit<Role, 'scope' | 'forbidden' | 'done' | 'escalation' | 'source'> & {
  scope?: string[]
  forbidden?: string[]
  done?: { commands?: string[]; text?: string | null }
  escalation?: string | null
}

export const TOO_MANY_ROLES = {
  error: { message: `A configuration holds at most ${AGENT_ROLES_MAX} roles.` },
} as const

export function unknownPreset(preset: string): Refusal {
  return { error: { message: `Unknown preset: ${preset}` } }
}

export function findPreset(slug: string) {
  return ROLE_PRESETS.find((item) => item.slug === slug)
}

/** The role as the catalog keeps it, or the refusal listing why. */
export function checkRole(role: unknown): { role: Role } | { refused: Refusal } {
  const parsed = roleSchema.safeParse(role)
  if (parsed.success) return { role: parsed.data }
  const problems = parsed.error.issues.map((issue) =>
    issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  )
  return { refused: { error: { message: 'Invalid role', problems } } }
}

/** A role written by the owner, with the defaults of the fields left out. */
export function roleFromFields(fields: RoleFields): unknown {
  return {
    scope: [],
    forbidden: [],
    escalation: null,
    source: null,
    ...fields,
    done: { commands: [], text: null, ...fields.done },
  }
}

export function rolesOf(config: AgentConfig, client?: TransactionClientContract) {
  return AgentConfigRole.query({ client }).where('agentConfigId', config.id).orderBy('id')
}

/** The unique index on (configuration, slug) backs the in-transaction check. */
function isSlugClash(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === PgErrorCode.UniqueViolation
}

/** A slug clash raced past the in-transaction check is a conflict too. */
async function slugSafe(run: () => Promise<RoleOutcome>): Promise<RoleOutcome> {
  try {
    return await run()
  } catch (error) {
    if (isSlugClash(error)) return { conflict: true }
    throw error
  }
}

/** Adds a role copied from a preset or written by the owner (`POST …/roles`, `add_role*`). */
export function createRole(
  configId: number,
  user: User,
  from: { preset: string } | RoleFields,
  client?: TransactionClientContract,
): Promise<RoleOutcome> {
  return slugSafe(() =>
    (client ?? db).transaction(async (trx) => {
      const config = await findOwnedAgentConfig(configId, user, trx)
      if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }

      let candidate: unknown
      if ('preset' in from) {
        const preset = findPreset(from.preset)
        if (!preset) return { refused: unknownPreset(from.preset) }
        candidate = presetRole(preset, inputsChecks(await currentInputs(config)))
      } else {
        candidate = roleFromFields(from)
      }
      const checked = checkRole(candidate)
      if ('refused' in checked) return checked

      const roles = await rolesOf(config, trx)
      if (roles.length >= AGENT_ROLES_MAX) return { refused: TOO_MANY_ROLES }
      if (roles.some((item) => item.slug === checked.role.slug)) return { conflict: true }

      const role = await AgentConfigRole.create(
        { ...checked.role, agentConfigId: config.id },
        { client: trx },
      )
      await bumpRevision(config, trx)
      return { config, role }
    }),
  )
}

/**
 * Changes a role (`PATCH …/roles/:roleId`, `edit_role`): omitted fields keep their value,
 * `source` included; the whole role is checked again.
 */
export function updateRole(
  configId: number,
  roleId: number,
  user: User,
  fields: Partial<RoleFields>,
  client?: TransactionClientContract,
): Promise<RoleOutcome> {
  return slugSafe(() =>
    (client ?? db).transaction(async (trx) => {
      const config = await findOwnedAgentConfig(configId, user, trx)
      if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }
      const roles = await rolesOf(config, trx)
      const role = roles.find((item) => item.id === roleId)
      if (!role) return { notFound: AGENT_ROLE_NOT_FOUND }

      const stored = role.toRole()
      const checked = checkRole({ ...stored, ...fields, done: { ...stored.done, ...fields.done } })
      if ('refused' in checked) return checked
      if (isDeepStrictEqual(checked.role, stored)) return { config, role }
      if (roles.some((item) => item.id !== role.id && item.slug === checked.role.slug)) {
        return { conflict: true }
      }

      await role.useTransaction(trx).merge(checked.role).save()
      await bumpRevision(config, trx)
      return { config, role }
    }),
  )
}

/** Removes a role (`DELETE …/roles/:roleId`, `remove_role`); null when done. */
export function removeRole(
  configId: number,
  roleId: number,
  user: User,
  client?: TransactionClientContract,
): Promise<NotFound | null> {
  return (client ?? db).transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return AGENT_CONFIG_NOT_FOUND
    const role = await rolesOf(config, trx).where('id', roleId).first()
    if (!role) return AGENT_ROLE_NOT_FOUND

    await role.useTransaction(trx).delete()
    await bumpRevision(config, trx)
    return null
  })
}

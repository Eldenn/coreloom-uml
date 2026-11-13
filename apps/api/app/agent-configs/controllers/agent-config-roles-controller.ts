import { isDeepStrictEqual } from 'node:util'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { presetRole, ROLE_PRESETS, type Role, roleSchema } from '@coreloom-uml/catalog'
import { AGENT_ROLES_MAX } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import { serializeAgentRole } from '#app/agent-configs/serializers/agent-config-serializer'
import { currentInputs, inputsChecks } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  AGENT_ROLE_NOT_FOUND,
  AGENT_ROLE_SLUG_TAKEN,
  agentConfigImpact,
  bumpRevision,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { AGENT_ROLES_NOT_FOUND, agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import {
  createAgentRoleFromPresetInput,
  createAgentRoleInput,
  updateAgentRoleInput,
} from '#app/agent-configs/validators/agent-configs-input'
import { PgErrorCode } from '#app/shared/database/pg-error'

const TOO_MANY_ROLES = {
  error: { message: `A configuration holds at most ${AGENT_ROLES_MAX} roles.` },
} as const

function unknownPreset(preset: string) {
  return { error: { message: `Unknown preset: ${preset}` } }
}

/** The role as the catalog keeps it, or the 422 body listing why it is refused. */
function checkRole(role: unknown): { role: Role } | { refused: object } {
  const parsed = roleSchema.safeParse(role)
  if (parsed.success) return { role: parsed.data }
  const problems = parsed.error.issues.map((issue) =>
    issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  )
  return { refused: { error: { message: 'Invalid role', problems } } }
}

function rolesOf(config: AgentConfig, trx: TransactionClientContract) {
  return AgentConfigRole.query({ client: trx }).where('agentConfigId', config.id).orderBy('id')
}

/** The unique index on (configuration, slug) backs the in-transaction check. */
function isSlugClash(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === PgErrorCode.UniqueViolation
}

/** Roles of a configuration: written by the owner or copied from a catalog preset. */
export default class AgentConfigRolesController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await agentRolesEnabled(user))) return response.notFound(AGENT_ROLES_NOT_FOUND)

    const body = request.body()
    const input =
      'preset' in body
        ? await request.validateUsing(createAgentRoleFromPresetInput)
        : await request.validateUsing(createAgentRoleInput)

    const run = () =>
      db.transaction(async (trx) => {
        const config = await findOwnedAgentConfig(params.id, user, trx)
        if (!config) return { notFound: true as const }

        let candidate: unknown
        if ('preset' in input) {
          const preset = ROLE_PRESETS.find((item) => item.slug === input.preset)
          if (!preset) return { refused: unknownPreset(input.preset) }
          candidate = presetRole(preset, inputsChecks(await currentInputs(config)))
        } else {
          candidate = {
            scope: [],
            forbidden: [],
            escalation: null,
            source: null,
            ...input,
            done: { commands: [], text: null, ...input.done },
          }
        }
        const checked = checkRole(candidate)
        if ('refused' in checked) return checked

        const roles = await rolesOf(config, trx)
        if (roles.length >= AGENT_ROLES_MAX) return { refused: TOO_MANY_ROLES }
        if (roles.some((item) => item.slug === checked.role.slug))
          return { conflict: true as const }

        const role = await AgentConfigRole.create(
          { ...checked.role, agentConfigId: config.id },
          { client: trx },
        )
        await bumpRevision(config, trx)
        return { config, role }
      })

    let result: Awaited<ReturnType<typeof run>>
    try {
      result = await run()
    } catch (error) {
      if (isSlugClash(error)) return response.conflict(AGENT_ROLE_SLUG_TAKEN)
      throw error
    }

    if ('notFound' in result) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    if ('conflict' in result) return response.conflict(AGENT_ROLE_SLUG_TAKEN)
    return response.created({
      role: serializeAgentRole(result.role),
      impact: await agentConfigImpact(result.config),
    })
  }

  /** Omitted fields keep their value, `source` included; the whole role is checked again. */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await agentRolesEnabled(user))) return response.notFound(AGENT_ROLES_NOT_FOUND)

    const input = await request.validateUsing(updateAgentRoleInput)

    const run = () =>
      db.transaction(async (trx) => {
        const config = await findOwnedAgentConfig(params.id, user, trx)
        if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }
        const roles = await rolesOf(config, trx)
        const role = roles.find((item) => item.id === Number(params.roleId))
        if (!role) return { notFound: AGENT_ROLE_NOT_FOUND }

        const stored = role.toRole()
        const checked = checkRole({ ...stored, ...input, done: { ...stored.done, ...input.done } })
        if ('refused' in checked) return checked
        if (isDeepStrictEqual(checked.role, stored)) return { config, role }
        if (roles.some((item) => item.id !== role.id && item.slug === checked.role.slug)) {
          return { conflict: true as const }
        }

        await role.useTransaction(trx).merge(checked.role).save()
        await bumpRevision(config, trx)
        return { config, role }
      })

    let result: Awaited<ReturnType<typeof run>>
    try {
      result = await run()
    } catch (error) {
      if (isSlugClash(error)) return response.conflict(AGENT_ROLE_SLUG_TAKEN)
      throw error
    }

    if ('notFound' in result) return response.notFound(result.notFound)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    if ('conflict' in result) return response.conflict(AGENT_ROLE_SLUG_TAKEN)
    return response.ok({
      role: serializeAgentRole(result.role),
      impact: await agentConfigImpact(result.config),
    })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await agentRolesEnabled(user))) return response.notFound(AGENT_ROLES_NOT_FOUND)

    const notFound = await db.transaction(async (trx) => {
      const config = await findOwnedAgentConfig(params.id, user, trx)
      if (!config) return AGENT_CONFIG_NOT_FOUND
      const role = await rolesOf(config, trx).where('id', Number(params.roleId)).first()
      if (!role) return AGENT_ROLE_NOT_FOUND

      await role.useTransaction(trx).delete()
      await bumpRevision(config, trx)
      return null
    })

    if (notFound) return response.notFound(notFound)
    return response.noContent()
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import { mergeSources } from '#app/agent-configs/services/agent-config-merge'
import {
  AGENT_CONFIG_NOT_FOUND,
  describeAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import { mergeAgentConfigsInput } from '#app/agent-configs/validators/agent-configs-input'
import { assertOwner } from '#app/shared/authorization/assert-owner'

/** A new configuration made from several of the owner's, which stay as they are. */
export default class AgentConfigMergesController {
  /**
   * `POST /agent-configs/merge`: 201 with the new configuration, outside any project and without
   * a generation. While a conflict has no choice, nothing is created: 200 with `conflicts`, to
   * send again with `choices`. 422 when the result would pass a configuration's limits. Roles
   * are merged only while the `agent-roles` flag is on for the caller.
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const input = await request.validateUsing(mergeAgentConfigsInput)
    const withRoles = await agentRolesEnabled(user)

    const result = await db.transaction(async (trx) => {
      const rows = await AgentConfig.query({ client: trx })
        .whereIn('id', input.sourceIds)
        .preload('readyRules', (query) => query.orderBy('id', 'asc'))
        .preload('rules', (query) => query.orderBy('position', 'asc').orderBy('id', 'asc'))
        .preload('roles', (query) => query.orderBy('id', 'asc'))
      const sources = input.sourceIds.flatMap((id) => rows.filter((row) => row.id === id))
      if (
        sources.length < input.sourceIds.length ||
        !sources.every((row) => assertOwner(row, user))
      )
        return { notFound: true as const }

      const outcome = mergeSources(
        sources.map((source) => ({
          id: source.id,
          targets: source.targets,
          notes: source.notes,
          readyRules: source.readyRules,
          rules: source.rules,
          roles: withRoles ? source.roles.map((role) => role.toRole()) : [],
        })),
        input.choices,
      )
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
      return { config }
    })

    if ('notFound' in result) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    if ('conflicts' in result) return response.ok({ conflicts: result.conflicts })
    return response.created(await describeAgentConfig(result.config))
  }
}

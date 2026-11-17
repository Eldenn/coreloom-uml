import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { acceptedProblem, findRuleGroup, RULE_PACKS } from '@coreloom-uml/catalog'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import {
  AGENT_CONFIG_NOT_FOUND,
  bumpRevision,
  describeAgentConfig,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { updateAgentReadyRulesInput } from '#app/agent-configs/validators/agent-configs-input'

/** The catalog's ready-made rules a configuration holds, group by group. */
export default class AgentConfigReadyRulesController {
  /**
   * Replaces the rules held in one group, named by its slot: an empty list removes them all.
   * Nothing is saved unless the rules can be held together in that group (`acceptedProblem`),
   * a 422 otherwise. The revision goes up only when the group's rules changed.
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await findOwnedAgentConfig(params.id, user))) {
      return response.notFound(AGENT_CONFIG_NOT_FOUND)
    }

    const { rules } = await request.validateUsing(updateAgentReadyRulesInput)
    const slot = String(params.slot)
    const group = findRuleGroup(RULE_PACKS, slot)
    if (!group) {
      return response.unprocessableEntity({ error: { message: `Unknown slot: ${slot}` } })
    }
    const problem = acceptedProblem(group, rules)
    if (problem) return response.unprocessableEntity({ error: { message: problem } })
    const next = rules.map(({ rule, value }) => ({ rule, value: value ?? null }))

    const config = await db.transaction(async (trx) => {
      // Locked until the transaction ends, so two requests cannot both replace the group.
      const locked = await findOwnedAgentConfig(params.id, user, trx)
      if (!locked) return null
      const held = () =>
        AgentConfigReadyRule.query({ client: trx })
          .where('agentConfigId', locked.id)
          .where('slot', slot)
      const rows = await held()
      const same =
        rows.length === next.length &&
        next.every((item) => rows.some((row) => row.rule === item.rule && row.value === item.value))
      if (same) return locked
      await held().delete()
      await AgentConfigReadyRule.createMany(
        next.map((item) => ({ agentConfigId: locked.id, slot, ...item })),
        { client: trx },
      )
      await bumpRevision(locked, trx)
      return locked
    })
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    return response.ok(await describeAgentConfig(config))
  }
}

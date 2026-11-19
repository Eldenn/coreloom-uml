import type { HttpContext } from '@adonisjs/core/http'
import { replaceReadyRules } from '#app/agent-configs/services/agent-rules'
import {
  AGENT_CONFIG_NOT_FOUND,
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
    const next = rules.map(({ rule, value }) => ({ rule, value: value ?? null }))
    const result = await replaceReadyRules(Number(params.id), user, String(params.slot), () => next)
    if ('notFound' in result) return response.notFound(result.notFound)
    if ('refused' in result) return response.unprocessableEntity(result.refused)

    return response.ok(await describeAgentConfig(result))
  }
}

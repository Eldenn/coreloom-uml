import type { HttpContext } from '@adonisjs/core/http'
import { serializeAgentRule } from '#app/agent-configs/serializers/agent-config-serializer'
import { addRule, removeRule, updateRule } from '#app/agent-configs/services/agent-rules'
import { agentConfigImpact } from '#app/agent-configs/services/owned-agent-config'
import {
  createAgentRuleInput,
  updateAgentRuleInput,
} from '#app/agent-configs/validators/agent-configs-input'

/** Accepted rules of a configuration: written by hand or accepted from a proposal. */
export default class AgentConfigRulesController {
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const fields = await request.validateUsing(createAgentRuleInput)

    const result = await addRule(Number(params.id), user, fields)
    if ('notFound' in result) return response.notFound(result.notFound)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    return response.created({
      rule: serializeAgentRule(result.rule),
      impact: await agentConfigImpact(result.config),
    })
  }

  /** Moving a rule (`position`) shifts the others; the order is kept gap-free. */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const fields = await request.validateUsing(updateAgentRuleInput)

    const result = await updateRule(Number(params.id), Number(params.ruleId), user, fields)
    if ('notFound' in result) return response.notFound(result.notFound)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    return response.ok({
      rule: serializeAgentRule(result.rule),
      impact: await agentConfigImpact(result.config),
    })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const notFound = await removeRule(Number(params.id), Number(params.ruleId), user)
    if (notFound) return response.notFound(notFound)
    return response.noContent()
  }
}

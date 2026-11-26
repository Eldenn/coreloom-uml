import type { HttpContext } from '@adonisjs/core/http'
import { mergeAgentConfigs } from '#app/agent-configs/services/agent-config-writes'
import {
  AGENT_CONFIG_NOT_FOUND,
  describeAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import { mergeAgentConfigsInput } from '#app/agent-configs/validators/agent-configs-input'

/** A new configuration made from several of the owner's, which stay as they are. */
export default class AgentConfigMergesController {
  /**
   * `POST /agent-configs/merge`: 201 with the new configuration, outside any project and without
   * a generation. While a conflict has no choice, nothing is created: 200 with `conflicts`, to
   * send again with `choices`. Held skills add up. 422 when the result would pass a
   * configuration's limits. Roles are merged only while the `agent-roles` flag is on for the
   * caller.
   */
  async store({ request, auth, response }: HttpContext) {
    const input = await request.validateUsing(mergeAgentConfigsInput)
    const result = await mergeAgentConfigs(auth.getUserOrFail(), input)

    if ('notFound' in result) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    if ('conflicts' in result) return response.ok({ conflicts: result.conflicts })
    return response.created(await describeAgentConfig(result.config))
  }
}

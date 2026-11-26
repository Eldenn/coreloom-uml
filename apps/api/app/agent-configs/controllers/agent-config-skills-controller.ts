import type { HttpContext } from '@adonisjs/core/http'
import { replaceAgentSkills } from '#app/agent-configs/services/agent-skills'
import { describeAgentConfig } from '#app/agent-configs/services/owned-agent-config'
import { updateAgentSkillsInput } from '#app/agent-configs/validators/agent-configs-input'

/** The skills a configuration holds, which `pull` installs: chosen freely among those with an approved copy. */
export default class AgentConfigSkillsController {
  async update({ params, request, auth, response }: HttpContext) {
    const { skills } = await request.validateUsing(updateAgentSkillsInput)
    const result = await replaceAgentSkills(Number(params.id), auth.getUserOrFail(), () => skills)
    if ('notFound' in result) return response.notFound(result.notFound)
    if ('refused' in result) return response.unprocessableEntity(result.refused)
    return response.ok(await describeAgentConfig(result.config))
  }
}

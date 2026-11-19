import type { HttpContext } from '@adonisjs/core/http'
import { serializeAgentRole } from '#app/agent-configs/serializers/agent-config-serializer'
import { createRole, removeRole, updateRole } from '#app/agent-configs/services/agent-roles'
import {
  AGENT_ROLE_SLUG_TAKEN,
  agentConfigImpact,
} from '#app/agent-configs/services/owned-agent-config'
import { AGENT_ROLES_NOT_FOUND, agentRolesEnabled } from '#app/agent-configs/services/roles-flag'
import {
  createAgentRoleFromPresetInput,
  createAgentRoleInput,
  updateAgentRoleInput,
} from '#app/agent-configs/validators/agent-configs-input'

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

    const result = await createRole(params.id, user, input)
    if ('notFound' in result) return response.notFound(result.notFound)
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

    const result = await updateRole(params.id, Number(params.roleId), user, input)
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

    const notFound = await removeRole(params.id, Number(params.roleId), user)
    if (notFound) return response.notFound(notFound)
    return response.noContent()
  }
}

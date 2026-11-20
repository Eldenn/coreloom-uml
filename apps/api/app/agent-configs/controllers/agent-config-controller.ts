import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { serializeAgentConfig } from '#app/agent-configs/serializers/agent-config-serializer'
import {
  cleanNotes,
  createAgentConfig,
  deleteAgentConfig,
  lockProjectHasConfig,
} from '#app/agent-configs/services/agent-config-writes'
import {
  AGENT_CONFIG_NOT_FOUND,
  describeAgentConfig,
  findOwnedAgentConfig,
  PROJECT_HAS_AGENT_CONFIG,
} from '#app/agent-configs/services/owned-agent-config'
import {
  createAgentConfigInput,
  listAgentConfigsInput,
  updateAgentConfigInput,
} from '#app/agent-configs/validators/agent-configs-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { likePattern } from '#app/shared/database/like-pattern'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * Agent conventions: owner-scoped configurations, each in one of the owner's projects (at most
 * one per project) or outside any.
 */
export default class AgentConfigController {
  async index({ request, auth, response }: HttpContext) {
    const { page, perPage, projectId, search } = await request.validateUsing(listAgentConfigsInput)
    const user = auth.getUserOrFail()

    const query = AgentConfig.query()
      .where('userId', user.id)
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
    if (projectId) query.where('projectId', projectId)
    if (search) query.whereILike('name', likePattern(search))

    return response.ok(await paginate(query, { page, perPage }, serializeAgentConfig))
  }

  async store({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const input = await request.validateUsing(createAgentConfigInput)

    const created = await createAgentConfig(user, input)
    if ('notFound' in created) return response.notFound(PROJECT_NOT_FOUND)
    if ('conflict' in created) return response.conflict(PROJECT_HAS_AGENT_CONFIG)

    return response.created(await describeAgentConfig(created.config))
  }

  async show({ params, auth, response }: HttpContext) {
    const config = await findOwnedAgentConfig(params.id, auth.getUserOrFail())
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    return response.ok(await describeAgentConfig(config))
  }

  /**
   * Omitted fields are left as is. `projectId` moves it (409 when that project already holds a
   * configuration), null takes it out of its project.
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const input = await request.validateUsing(updateAgentConfigInput)

    if (input.projectId && !(await findOwnedProject(input.projectId, user)))
      return response.notFound(PROJECT_NOT_FOUND)
    const notes = cleanNotes(input.notes)

    const result = await db.transaction(async (trx) => {
      const config = await findOwnedAgentConfig(params.id, user, trx)
      if (!config) return { notFound: true as const }
      config.useTransaction(trx)

      if (input.projectId !== undefined && input.projectId !== config.projectId) {
        if (
          input.projectId !== null &&
          (await lockProjectHasConfig(input.projectId, config.id, trx))
        )
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

    if ('notFound' in result) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    if ('conflict' in result) return response.conflict(PROJECT_HAS_AGENT_CONFIG)
    return response.ok(await describeAgentConfig(result.config))
  }

  /** Its ready-made rules, rules, roles and generations go with it. */
  async destroy({ params, auth, response }: HttpContext) {
    const config = await findOwnedAgentConfig(params.id, auth.getUserOrFail())
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    await deleteAgentConfig(config)

    return response.noContent()
  }
}

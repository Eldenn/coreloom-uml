import type { HttpContext } from '@adonisjs/core/http'
import AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import {
  serializeAgentGeneration,
  serializeAgentGenerationSummary,
} from '#app/agent-configs/serializers/agent-config-serializer'
import { createGeneration } from '#app/agent-configs/services/agent-generations'
import {
  AGENT_CONFIG_NOT_FOUND,
  AGENT_GENERATION_NOT_FOUND,
  findOwnedAgentConfig,
  latestGeneration,
} from '#app/agent-configs/services/owned-agent-config'
import { listAgentGenerationsInput } from '#app/agent-configs/validators/agent-configs-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * Generations: frozen renders of a configuration. A new one is always rendered from the current
 * state, never merged with an older one; `latest` is what the CLI pulls.
 */
export default class AgentConfigGenerationsController {
  /**
   * Renders synchronously, with the skills that fit the rules held; only the newest AGENT_GENERATIONS_KEPT
   * generations are kept.
   */
  async store({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const generation = await createGeneration(params.id, user)
    if (!generation) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    return response.created({ generation: serializeAgentGeneration(generation) })
  }

  /** Newest first, without the files' content. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { page, perPage } = await request.validateUsing(listAgentGenerationsInput)
    const query = AgentConfigGeneration.query()
      .where('agentConfigId', config.id)
      .orderBy('id', 'desc')

    return response.ok(await paginate(query, { page, perPage }, serializeAgentGenerationSummary))
  }

  async latest({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const generation = await latestGeneration(config)
    if (!generation) return response.notFound(AGENT_GENERATION_NOT_FOUND)

    return response.ok({ generation: serializeAgentGeneration(generation) })
  }

  /**
   * `GET /projects/:id/agent-config/generations/latest`: the latest generation of the project's
   * configuration, which CLIs that address a configuration by its project still pull.
   */
  async latestOfProject({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await AgentConfig.findBy('projectId', project.id)
    if (!config || !assertOwner(config, user)) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const generation = await latestGeneration(config)
    if (!generation) return response.notFound(AGENT_GENERATION_NOT_FOUND)

    return response.ok({ generation: serializeAgentGeneration(generation) })
  }

  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const generation = await AgentConfigGeneration.query()
      .where('agentConfigId', config.id)
      .where('id', params.generationId)
      .first()
    if (!generation) return response.notFound(AGENT_GENERATION_NOT_FOUND)

    return response.ok({ generation: serializeAgentGeneration(generation) })
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { CATALOG_VERSION } from '@coreloom-uml/catalog'
import { AGENT_GENERATIONS_KEPT } from '#app/agent-configs/constants/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import {
  serializeAgentGeneration,
  serializeAgentGenerationSummary,
} from '#app/agent-configs/serializers/agent-config-serializer'
import { currentInputs, render, suggestSkills } from '#app/agent-configs/services/agent-context'
import {
  AGENT_CONFIG_NOT_FOUND,
  AGENT_GENERATION_NOT_FOUND,
  findProjectAgentConfig,
  latestGeneration,
} from '#app/agent-configs/services/owned-agent-config'
import { listAgentGenerationsInput } from '#app/agent-configs/validators/agent-configs-input'
import { findOwnedProject, PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * Generations: frozen renders of a configuration. A new one is always rendered from the current
 * state, never merged with an older one; `latest` is what the CLI pulls.
 */
export default class AgentConfigGenerationsController {
  /**
   * Renders synchronously, with the skills that fit the answers; only the newest AGENT_GENERATIONS_KEPT
   * generations are kept.
   */
  async store({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)

    const generation = await db.transaction(async (trx) => {
      const config = await findProjectAgentConfig(project, user, trx)
      if (!config) return null
      const inputs = await currentInputs(config, project)
      const output = render(inputs)

      const created = await AgentConfigGeneration.create(
        {
          agentConfigId: config.id,
          revision: config.revision,
          catalogVersion: CATALOG_VERSION,
          inputs,
          files: output.files,
          recommendations: output.recommendations,
          skills: suggestSkills(inputs),
        },
        { client: trx },
      )

      const kept = AgentConfigGeneration.query({ client: trx })
        .select('id')
        .where('agentConfigId', config.id)
        .orderBy('id', 'desc')
        .limit(AGENT_GENERATIONS_KEPT)
      await AgentConfigGeneration.query({ client: trx })
        .where('agentConfigId', config.id)
        .whereNotIn('id', kept)
        .delete()

      return created
    })
    if (!generation) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    return response.created({ generation: serializeAgentGeneration(generation) })
  }

  /** Newest first, without the files' content. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const { page, perPage } = await request.validateUsing(listAgentGenerationsInput)
    const query = AgentConfigGeneration.query()
      .where('agentConfigId', config.id)
      .orderBy('id', 'desc')

    return response.ok(await paginate(query, { page, perPage }, serializeAgentGenerationSummary))
  }

  async latest({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const generation = await latestGeneration(config)
    if (!generation) return response.notFound(AGENT_GENERATION_NOT_FOUND)

    return response.ok({ generation: serializeAgentGeneration(generation) })
  }

  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const project = await findOwnedProject(params.id, user)
    if (!project) return response.notFound(PROJECT_NOT_FOUND)
    const config = await findProjectAgentConfig(project, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)

    const generation = await AgentConfigGeneration.query()
      .where('agentConfigId', config.id)
      .where('id', params.generationId)
      .first()
    if (!generation) return response.notFound(AGENT_GENERATION_NOT_FOUND)

    return response.ok({ generation: serializeAgentGeneration(generation) })
  }
}

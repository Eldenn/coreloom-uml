import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CATALOG_VERSION } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { AGENT_GENERATIONS_KEPT } from '#app/agent-configs/constants/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import { currentInputs, render, suggestSkills } from '#app/agent-configs/services/agent-context'
import { heldSkills } from '#app/agent-configs/services/agent-skills'
import { findOwnedAgentConfig } from '#app/agent-configs/services/owned-agent-config'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { loadComputedAffinities } from '#app/skills/services/skill-rule-scores'
import { suggestableSkills } from '#app/skills/services/skills-catalog'
import type User from '#app/users/models/user'

/**
 * Renders the configuration now, with the skills that fit the rules held and those it holds, and keeps only the
 * newest AGENT_GENERATIONS_KEPT generations (`POST …/generations`, `generate_files`). Null when
 * the configuration is not the caller's.
 */
export async function createGeneration(
  configId: number,
  user: User,
  client?: TransactionClientContract,
): Promise<AgentConfigGeneration | null> {
  const skills = await suggestableSkills()
  // Computed affinities, behind their flag, once a run scored the current model and catalog.
  const computed = (await isFeatureEnabled(FeatureFlagKey.ComputedSkillAffinities, user))
    ? await loadComputedAffinities()
    : null
  return (client ?? db).transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return null
    const inputs = await currentInputs(config)
    const output = render(inputs)

    const created = await AgentConfigGeneration.create(
      {
        agentConfigId: config.id,
        revision: config.revision,
        catalogVersion: CATALOG_VERSION,
        inputs,
        files: output.files,
        recommendations: output.recommendations,
        roles: output.roles,
        skills: {
          ...suggestSkills(inputs, skills, computed ?? undefined),
          ...(await heldSkills(config.id, trx)),
        },
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
}

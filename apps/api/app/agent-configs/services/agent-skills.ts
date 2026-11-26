import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import { byName } from '#app/agent-configs/serializers/agent-config-serializer'
import {
  AGENT_CONFIG_NOT_FOUND,
  bumpRevision,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import CatalogSkill from '#app/skills/models/catalog-skill'
import { INSTALLABLE_SQL } from '#app/skills/services/skills-query'
import type User from '#app/users/models/user'

export type SkillsOutcome =
  | { notFound: typeof AGENT_CONFIG_NOT_FOUND }
  | { refused: { error: { message: string; problems: string[] } } }
  | { config: AgentConfig }

/**
 * Replaces the skills a configuration holds, in one transaction with the configuration locked.
 * A skill it already holds may stay even if its copy is no longer served; one it does not hold
 * yet must have an approved copy (`INSTALLABLE_SQL`), else nothing is saved. The revision goes up
 * only when the set changed.
 */
export async function replaceAgentSkills(
  configId: number,
  user: User,
  slugs: string[],
): Promise<SkillsOutcome> {
  return db.transaction(async (trx) => {
    const config = await findOwnedAgentConfig(configId, user, trx)
    if (!config) return { notFound: AGENT_CONFIG_NOT_FOUND }

    const held = await AgentConfigSkill.query({ client: trx })
      .where('agentConfigId', config.id)
      .preload('skill')
    const heldSlugs = new Set(held.map((row) => row.skill.slug))
    const added = slugs.filter((slug) => !heldSlugs.has(slug))
    const removed = held.filter((row) => !slugs.includes(row.skill.slug))

    const found = added.length
      ? await CatalogSkill.query({ client: trx }).whereIn('slug', added).whereRaw(INSTALLABLE_SQL)
      : []
    const missing = added.filter((slug) => !found.some((skill) => skill.slug === slug))
    if (missing.length > 0) {
      return {
        refused: {
          error: { message: 'Only a skill with an approved copy can be added', problems: missing },
        },
      }
    }
    if (added.length === 0 && removed.length === 0) return { config }

    if (removed.length > 0) {
      await AgentConfigSkill.query({ client: trx })
        .whereIn(
          'id',
          removed.map((row) => row.id),
        )
        .delete()
    }
    await AgentConfigSkill.createMany(
      found.map((skill) => ({ agentConfigId: config.id, skillId: skill.id })),
      { client: trx },
    )
    await bumpRevision(config, trx)
    return { config }
  })
}

/** The slugs of the skills a configuration holds, by name: what a generation records. */
export async function heldSkillSlugs(
  configId: number,
  client?: TransactionClientContract,
): Promise<string[]> {
  const rows = await AgentConfigSkill.query({ client })
    .where('agentConfigId', configId)
    .preload('skill')
  return byName(rows).map((row) => row.skill.slug)
}

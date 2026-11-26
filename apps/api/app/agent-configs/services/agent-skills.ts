import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { SKILL_FOLDERS, type Target } from '@coreloom-uml/catalog'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import { byName } from '#app/agent-configs/serializers/agent-config-serializer'
import {
  AGENT_CONFIG_NOT_FOUND,
  bumpRevision,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillVersion from '#app/skills/models/skill-version'
import {
  installName,
  newestApproved,
  readSkillVersionFiles,
} from '#app/skills/services/skill-versions'
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

/**
 * What a generation records of the skills a configuration holds: their slugs, by name, and the
 * copy `GET /skills/:slug/copy` serves now of each one it still serves.
 */
export async function heldSkills(
  configId: number,
  client?: TransactionClientContract,
): Promise<{ held: string[]; copies: { slug: string; versionId: number }[] }> {
  const rows = byName(
    await AgentConfigSkill.query({ client }).where('agentConfigId', configId).preload('skill'),
  )
  const served = rows.length
    ? await CatalogSkill.query({ client })
        .whereIn(
          'id',
          rows.map((row) => row.skillId),
        )
        .whereRaw(INSTALLABLE_SQL)
    : []
  const copies = []
  for (const row of rows) {
    if (!served.some((skill) => skill.id === row.skillId)) continue
    const version = await newestApproved(row.skillId)
    if (version) copies.push({ slug: row.skill.slug, versionId: version.id })
  }
  return { held: rows.map((row) => row.skill.slug), copies }
}

/**
 * The files of a generation's held skills as `pull` lays them out: each copy whole, under
 * `<SKILL_FOLDERS[target]>/<name>/` for each folder its targets use. Read from Drive, where a copy
 * is never rewritten.
 */
export async function heldSkillFiles(
  copies: { slug: string; versionId: number }[],
  targets: Target[],
): Promise<{ slug: string; path: string; content: string }[]> {
  const folders = [...new Set(targets.map((target) => SKILL_FOLDERS[target]))]
  const files = []
  for (const { slug, versionId } of copies) {
    const version = await SkillVersion.find(versionId)
    if (!version) continue
    const copy = await readSkillVersionFiles(version)
    const name = installName(copy, slug)
    for (const folder of folders) {
      for (const file of copy) {
        files.push({ slug, path: `${folder}/${name}/${file.path}`, content: file.content })
      }
    }
  }
  return files
}

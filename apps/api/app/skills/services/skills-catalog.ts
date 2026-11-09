import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { SKILL_SEARCH_PLAN, SKILLS, type Skill, SkillOrigin, TARGETS } from '@coreloom-uml/catalog'
import { DateTime } from 'luxon'
import { SKILLS_SEARCH_LIMITS, SkillStatus } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillSnapshot from '#app/skills/models/skill-snapshot'
import {
  type KnownSkill,
  type SearchReport,
  type SkillRecord,
  searchSkills,
} from '#app/skills/services/skills-search'

/**
 * Copies the hand-picked skills of `@coreloom-uml/catalog` into the `skills` table, so the
 * catalog lists them with the found ones. Registry figures the search added are kept; a manual
 * skill no longer in the package is left as it is, since suggestions read the package itself.
 */
export async function syncManualSkills(skills: readonly Skill[] = SKILLS): Promise<number> {
  for (const skill of skills) {
    const values = {
      name: skill.name,
      description: skill.description,
      url: skill.url,
      targets: [...skill.targets],
      affinities: structuredClone(skill.affinities),
      origin: SkillOrigin.Manual,
      eligible: true,
      ineligibleReason: null,
    }
    const existing = await CatalogSkill.findBy('slug', skill.id)
    if (existing) {
      if (existing.origin !== SkillOrigin.Manual) {
        // A found skill took the slug first: the hand-picked entry replaces it.
        existing.merge({ registryId: null, source: null, contentSha: null, license: null })
      }
      await existing.merge(values).save()
    } else {
      await CatalogSkill.create({ slug: skill.id, ...values, topics: [], audits: [] })
    }
  }
  return skills.length
}

export type RefreshCatalogOptions = {
  fetch?: typeof fetch
  githubToken?: string
  now?: DateTime
  onProgress?: (message: string) => void
}

/**
 * Runs the search plan on skills.sh, writes what it learnt to the `skills` table, and keeps a
 * snapshot of every skill a search returned.
 */
export async function refreshCatalog(options: RefreshCatalogOptions = {}): Promise<SearchReport> {
  const now = options.now ?? DateTime.now()
  const rows = await CatalogSkill.all()
  const known: KnownSkill[] = rows.map((row) => ({
    slug: row.slug,
    origin: row.origin,
    blocked: row.status === SkillStatus.Blocked,
    registryId: row.registryId,
    name: row.name,
    description: row.description,
    url: row.url,
    affinities: row.affinities,
    topics: row.topics,
    installs: row.installs,
    audits: row.audits,
    license: row.license,
    contentSha: row.contentSha,
    eligible: row.eligible,
    ineligibleReason: row.ineligibleReason,
  }))

  const { records, report } = await searchSkills({
    known,
    plan: SKILL_SEARCH_PLAN,
    fetch: options.fetch ?? fetch,
    githubToken: options.githubToken,
    onProgress: options.onProgress,
    minInstalls: SKILLS_SEARCH_LIMITS.minInstalls,
    githubChecks: options.githubToken
      ? SKILLS_SEARCH_LIMITS.githubChecks
      : SKILLS_SEARCH_LIMITS.githubChecksWithoutToken,
  })

  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  await db.transaction(async (trx) => {
    for (const record of records) {
      const row = await saveRecord(record, bySlug.get(record.slug), now, trx)
      if (record.seen) {
        await SkillSnapshot.create(
          {
            skillId: row.id,
            takenAt: now,
            installs: record.installs,
            audits: record.audits,
            eligible: row.eligible,
            ineligibleReason: row.ineligibleReason,
          },
          { client: trx },
        )
      }
    }
  })
  return report
}

/** Writes one record; a manual or blocked skill only takes the registry's figures. */
async function saveRecord(
  record: SkillRecord,
  row: CatalogSkill | undefined,
  now: DateTime,
  trx: TransactionClientContract,
): Promise<CatalogSkill> {
  const registry = {
    registryId: record.registryId,
    source: record.source,
    installs: record.installs,
    audits: record.audits,
    firstSeenAt: row?.firstSeenAt ?? now,
    ...(record.seen ? { lastSeenAt: now } : {}),
  }
  if (row && (row.origin === SkillOrigin.Manual || row.status === SkillStatus.Blocked)) {
    row.useTransaction(trx)
    return row
      .merge({ ...registry, topics: [...new Set([...row.topics, ...record.topics])] })
      .save()
  }
  const values = {
    ...registry,
    name: record.name,
    description: record.description,
    url: record.url,
    affinities: record.affinities,
    topics: record.topics,
    license: record.license,
    contentSha: record.contentSha,
    eligible: record.eligible,
    ineligibleReason: record.ineligibleReason,
    ...(record.checked ? { checkedAt: now } : {}),
  }
  if (row) {
    row.useTransaction(trx)
    return row.merge(values).save()
  }
  return CatalogSkill.create(
    {
      slug: record.slug,
      origin: SkillOrigin.Search,
      status: SkillStatus.Active,
      targets: [...TARGETS],
      ...values,
    },
    { client: trx },
  )
}

/**
 * The skills generations may suggest: the package's hand-picked ones, then the found ones that
 * passed every check, most installed first. Blocked skills are left out.
 */
export async function suggestableSkills(): Promise<Skill[]> {
  const blocked = new Set(
    (await CatalogSkill.query().where('status', SkillStatus.Blocked).select('slug')).map(
      (row) => row.slug,
    ),
  )
  const found = await CatalogSkill.query()
    .where('origin', SkillOrigin.Search)
    .where('status', SkillStatus.Active)
    .where('eligible', true)
    .whereNotNull('contentSha')
    .whereNotNull('checkedAt')
    .orderByRaw('installs desc nulls last')
    .orderBy('id')
  return [
    ...SKILLS.filter((skill) => !blocked.has(skill.id)),
    ...found.map((row) => row.toSkill()).filter((skill) => skill.affinities.length > 0),
  ]
}

/** Takes a skill out of the suggestions, or puts it back; `false` when the slug is unknown. */
export async function setSkillBlocked(
  slug: string,
  blocked: boolean,
  reason?: string,
): Promise<boolean> {
  const row = await CatalogSkill.findBy('slug', slug)
  if (!row) return false
  await row
    .merge({
      status: blocked ? SkillStatus.Blocked : SkillStatus.Active,
      statusReason: blocked ? (reason?.slice(0, 300) ?? null) : null,
    })
    .save()
  return true
}

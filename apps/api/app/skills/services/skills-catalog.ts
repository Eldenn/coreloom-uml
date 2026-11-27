import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  isTopic,
  SKILL_SEARCH_PLAN,
  SKILLS,
  type Skill,
  SkillOrigin,
  TARGETS,
} from '@coreloom-uml/catalog'
import { DateTime } from 'luxon'
import {
  SKILL_BLOCK_REASON_MAX_LENGTH,
  SKILL_SOURCE_LIMITS,
  SKILLS_SEARCH_LIMITS,
  SkillStatus,
  TRUSTING_SOURCE_KINDS,
} from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillSnapshot from '#app/skills/models/skill-snapshot'
import SkillSource from '#app/skills/models/skill-source'
import { effectiveTopics } from '#app/skills/services/skill-topics'
import { captureSkillVersions } from '#app/skills/services/skill-versions'
import {
  type KnownSkill,
  type SearchReport,
  type SearchSource,
  type SkillRecord,
  type SourceOutcome,
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
      const searchTopics = [...new Set([...(skill.topics ?? []), ...existing.searchTopics])]
      await existing
        .merge({
          ...values,
          searchTopics,
          topics: effectiveTopics(searchTopics, existing.taggerTopics, existing.reviewedTopics),
        })
        .save()
    } else {
      const searchTopics = [...(skill.topics ?? [])]
      await CatalogSkill.create({
        slug: skill.id,
        ...values,
        searchTopics,
        topics: searchTopics,
        audits: [],
      })
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
 * Reads every enabled source (skills.sh with the search plan, the trusted GitHub repositories),
 * writes what it learnt to the `skills` table, which source listed which skill and how each one
 * answered, and keeps a snapshot of every skill a source listed.
 */
export async function refreshCatalog(options: RefreshCatalogOptions = {}): Promise<SearchReport> {
  const now = options.now ?? DateTime.now()
  const rows = await CatalogSkill.all()
  const sources = await enabledSources()
  const trust = await trustedBy()
  const known = rows.map((row) => toKnown(row, trust))

  const {
    records,
    report,
    sources: outcomes,
  } = await searchSkills({
    known,
    plan: SKILL_SEARCH_PLAN,
    sources: sources.map(toSearchSource),
    fetch: options.fetch ?? fetch,
    githubToken: options.githubToken,
    onProgress: options.onProgress,
    minInstalls: SKILLS_SEARCH_LIMITS.minInstalls,
    githubChecks: options.githubToken
      ? SKILLS_SEARCH_LIMITS.githubChecks
      : SKILLS_SEARCH_LIMITS.githubChecksWithoutToken,
    pageDescriptions: SKILLS_SEARCH_LIMITS.pageDescriptions,
  })

  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  await db.transaction(async (trx) => {
    const ids = new Map<string, number>()
    for (const record of records) {
      const row = await saveRecord(record, bySlug.get(record.slug), now, trx)
      ids.set(record.slug, row.id)
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
    for (const outcome of outcomes) await saveOutcome(outcome, records, ids, now, trx)
  })
  // After the rows are written: a skill checked this run is copied at its new pin.
  const versions = await captureSkillVersions({
    fetch: options.fetch,
    githubToken: options.githubToken,
    onProgress: options.onProgress,
  })
  report.copied = versions.captured
  report.warnings.push(...versions.warnings)
  return report
}

/** The enabled sources, skills.sh first. */
function enabledSources() {
  return SkillSource.query().where('enabled', true).orderBy('id')
}

function toSearchSource(source: SkillSource): SearchSource {
  return {
    id: source.id,
    kind: source.kind,
    owner: source.owner,
    repo: source.repo,
    path: source.path,
  }
}

/** For each skill, the enabled trusting sources that listed it at their last run that answered. */
async function trustedBy(): Promise<Map<number, number[]>> {
  const pairs: { skill_id: number; skill_source_id: number }[] = await db
    .from('skill_source_skills')
    .join('skill_sources', 'skill_sources.id', 'skill_source_skills.skill_source_id')
    .where('skill_sources.enabled', true)
    .whereIn('skill_sources.kind', [...TRUSTING_SOURCE_KINDS])
    .select('skill_source_skills.skill_id', 'skill_source_skills.skill_source_id')
  const trust = new Map<number, number[]>()
  for (const pair of pairs) {
    trust.set(pair.skill_id, [...(trust.get(pair.skill_id) ?? []), pair.skill_source_id])
  }
  return trust
}

/**
 * What a source listed replaces what it listed before when every query of it answered, is added
 * to it when only some did, and changes nothing when it did not answer; its run is recorded.
 */
async function saveOutcome(
  outcome: SourceOutcome,
  records: readonly SkillRecord[],
  ids: ReadonlyMap<string, number>,
  now: DateTime,
  trx: TransactionClientContract,
) {
  if (outcome.ok) {
    const listed = records
      .filter((record) => record.foundBy.includes(outcome.sourceId))
      .map((record) => ({ skill_source_id: outcome.sourceId, skill_id: ids.get(record.slug) }))
    if (outcome.complete) {
      await trx.from('skill_source_skills').where('skill_source_id', outcome.sourceId).delete()
    }
    if (listed.length > 0) {
      await trx.table('skill_source_skills').insert(listed).onConflict().ignore()
    }
  }
  await trx
    .from('skill_sources')
    .where('id', outcome.sourceId)
    .update({
      last_run_at: now.toJSDate(),
      last_error: outcome.error?.slice(0, SKILL_SOURCE_LIMITS.errorMaxLength) ?? null,
      updated_at: now.toJSDate(),
    })
}

function toKnown(row: CatalogSkill, trust: ReadonlyMap<number, number[]>): KnownSkill {
  return {
    slug: row.slug,
    origin: row.origin,
    blocked: row.status === SkillStatus.Blocked,
    registryId: row.registryId,
    name: row.name,
    description: row.description,
    url: row.url,
    affinities: row.affinities,
    // The search adds its queries' tags to these; the tagger's are kept apart (`skill-topics.ts`).
    topics: row.searchTopics,
    installs: row.installs,
    audits: row.audits,
    license: row.license,
    contentSha: row.contentSha,
    eligible: row.eligible,
    ineligibleReason: row.ineligibleReason,
    trustedBy: trust.get(row.id) ?? [],
  }
}

/**
 * One skill's share of the search, when the admin asks for it instead of waiting for the weekly
 * run: its audits are read again on skills.sh, a found skill is checked and pinned again on
 * GitHub, then its files are copied at that pin. No search runs, so its installs, affinities and
 * tags stay what the last one found, and a skill no search matched yet (no registry entry) is
 * only copied. Null when the catalog has no such skill.
 */
export async function syncSkill(
  slug: string,
  options: RefreshCatalogOptions = {},
): Promise<SearchReport | null> {
  const row = await CatalogSkill.findBy('slug', slug)
  if (!row) return null
  // No search and no listing: what each source listed stays as its last run wrote it.
  const { records, report } = await searchSkills({
    known: [toKnown(row, await trustedBy())],
    plan: [],
    sources: (await enabledSources()).map(toSearchSource),
    recheck: true,
    fetch: options.fetch ?? fetch,
    githubToken: options.githubToken,
    minInstalls: SKILLS_SEARCH_LIMITS.minInstalls,
    githubChecks: 1,
  })
  const now = options.now ?? DateTime.now()
  await db.transaction(async (trx) => {
    for (const record of records) await saveRecord(record, row, now, trx)
  })
  const versions = await captureSkillVersions({
    slug,
    fetch: options.fetch,
    githubToken: options.githubToken,
  })
  report.copied = versions.captured
  report.warnings.push(...versions.warnings)
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
    const searchTopics = [...new Set([...row.searchTopics, ...record.topics])]
    return row
      .merge({
        ...registry,
        searchTopics,
        topics: effectiveTopics(searchTopics, row.taggerTopics, row.reviewedTopics),
      })
      .save()
  }
  const values = {
    ...registry,
    name: record.name,
    description: record.description,
    url: record.url,
    affinities: record.affinities,
    searchTopics: record.topics,
    topics: effectiveTopics(record.topics, row?.taggerTopics ?? null, row?.reviewedTopics ?? null),
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
  const manual = await CatalogSkill.query().where('origin', SkillOrigin.Manual)
  const blocked = new Set(
    (await CatalogSkill.query().where('status', SkillStatus.Blocked).select('slug')).map(
      (row) => row.slug,
    ),
  )
  // A hand-picked skill reads its tags from its row: the tagger's, once it tagged it.
  const manualTopics = new Map(manual.map((row) => [row.slug, row.topics.filter(isTopic)]))
  const found = await CatalogSkill.query()
    .where('origin', SkillOrigin.Search)
    .where('status', SkillStatus.Active)
    .where('eligible', true)
    .whereNotNull('contentSha')
    .whereNotNull('checkedAt')
    .orderByRaw('installs desc nulls last')
    .orderBy('id')
  return [
    ...SKILLS.filter((skill) => !blocked.has(skill.id)).map((skill) => ({
      ...skill,
      topics: manualTopics.get(skill.id) ?? skill.topics,
    })),
    // A tag alone is enough: it may make a skill compatible (`matchSkills`).
    ...found
      .map((row) => row.toSkill())
      .filter((skill) => skill.affinities.length > 0 || skill.topics?.length),
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
      statusReason: blocked ? (reason?.slice(0, SKILL_BLOCK_REASON_MAX_LENGTH) ?? null) : null,
    })
    .save()
  return true
}

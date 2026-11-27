import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import {
  type AffinityDecision,
  CATALOG_VERSION,
  COMPUTED_AFFINITY_THRESHOLD,
  type ComputedAffinities,
  isSlotAffinity,
  pairKey,
  type ReadyRule,
  RULE_PACKS,
  type RuleGroup,
  type Skill,
} from '@coreloom-uml/catalog'
import { SKILL_RULE_SCORING } from '#app/skills/constants/skill-affinities'
import {
  EMBEDDING_PURPOSES,
  SKILL_EMBEDDING_MODEL_KEY,
  SKILL_TOPIC_LIMITS,
  SkillEmbeddingPurpose,
} from '#app/skills/constants/skill-topics'
import CatalogSkill from '#app/skills/models/catalog-skill'
import type SkillEmbedder from '#app/skills/services/skill-embedder'
import { embeddingHash, saveSkillVector, withEmbedder } from '#app/skills/services/skill-topics'
import { suggestableSkills } from '#app/skills/services/skills-catalog'

/** What the search reads of a skill: `name: description`, cut, as in the study. */
export function retrievalSkillText(skill: Pick<Skill, 'name' | 'description'>): string {
  return `${skill.name}: ${skill.description.en ?? ''}`.slice(0, SKILL_TOPIC_LIMITS.textMaxLength)
}

/** What the search reads of a rule: its group, its label, then its lines, as in the study. */
export function ruleText(group: RuleGroup, rule: ReadyRule): string {
  return `${group.label.en}${rule.label ? ` ${rule.label.en}` : ''}\n${rule.lines.join(' ')}`
}

/** A rule whose text holds what the owner types: its real text is unknown, it is never scored. */
export function isValueRule(rule: ReadyRule): boolean {
  return rule.lines.some((line) => line.includes('{value}'))
}

type ScoredRule = { slot: string; rule: ReadyRule; text: string }

/** Every ready-made rule the search scores: all of them but the `{value}` ones. */
export function scoredRules(): ScoredRule[] {
  return RULE_PACKS.flatMap((pack) =>
    pack.groups.flatMap((group) =>
      group.rules
        .filter((rule) => !isValueRule(rule))
        .map((rule) => ({ slot: group.slot, rule, text: ruleText(group, rule) })),
    ),
  )
}

/** What a finished run scored: the model and the catalog. Computed affinities read only its own. */
export function scoringHash(): string {
  return createHash('sha256')
    .update(JSON.stringify([SKILL_EMBEDDING_MODEL_KEY, CATALOG_VERSION]))
    .digest('hex')
}

/** Whether the last finished run scored the current model and catalog. */
export async function scoringIsCurrent(): Promise<boolean> {
  const row = await db.from('skill_scoring_state').where('id', 1).first()
  return row?.hash === scoringHash()
}

export type ScoreReport = {
  /** Skills and rules read by the model this run: new, or whose text changed. */
  embeddedSkills: number
  embeddedRules: number
  /** Pairs stored, from the floor. */
  scores: number
  duplicates: number
  /** Pairs waiting for the admin after this run. */
  pending: number
}

/**
 * Reads the search vectors that are missing (each suggestable skill's, each rule's but the
 * `{value}` ones), then scores every pair by cosine: `skill_rule_scores` from the floor,
 * `skill_near_duplicates`, the pairs proposed to the admin, then `skill_scoring_state`. Run by
 * `ClassifySkillTopicsJob` after the tags, in the `skill-tagger` worker only. The pairs already
 * decided stay as they are; the pending ones are replaced by this run's.
 */
export async function scoreSkillRules(
  options: { embedder?: SkillEmbedder; onProgress?: (message: string) => void } = {},
): Promise<ScoreReport> {
  const report: ScoreReport = {
    embeddedSkills: 0,
    embeddedRules: 0,
    scores: 0,
    duplicates: 0,
    pending: 0,
  }
  // In catalog order: the first of two near duplicates is the one kept.
  const catalog = await suggestableSkills()
  const rows = new Map(
    (
      await CatalogSkill.query().whereIn(
        'slug',
        catalog.map((skill) => skill.id),
      )
    ).map((row) => [row.slug, row]),
  )
  const skills = catalog.flatMap((skill) => {
    const row = rows.get(skill.id)
    return row ? [{ skill, id: row.id, text: retrievalSkillText(skill) }] : []
  })
  const rules = scoredRules()

  const storedSkills = new Map<number, string>(
    (
      await db
        .from('skill_embeddings')
        .where('purpose', SkillEmbeddingPurpose.Retrieval)
        .select('skill_id', 'hash')
    ).map((row: { skill_id: number; hash: string }) => [row.skill_id, row.hash]),
  )
  const storedRules = new Map<string, string>(
    (await db.from('rule_embeddings').select('slot', 'rule_id', 'hash')).map(
      (row: { slot: string; rule_id: string; hash: string }) => [
        `${row.slot}/${row.rule_id}`,
        row.hash,
      ],
    ),
  )
  const skillTodo = skills
    .map((item) => ({ ...item, hash: embeddingHash(item.text, 'retrieval') }))
    .filter((item) => storedSkills.get(item.id) !== item.hash)
  const ruleTodo = rules
    .map((item) => ({ ...item, hash: embeddingHash(item.text, 'rule') }))
    .filter((item) => storedRules.get(`${item.slot}/${item.rule.id}`) !== item.hash)

  if (skillTodo.length > 0 || ruleTodo.length > 0) {
    await withEmbedder(options.embedder, async (embedder) => {
      for (let start = 0; start < skillTodo.length; start += SKILL_TOPIC_LIMITS.batch) {
        const batch = skillTodo.slice(start, start + SKILL_TOPIC_LIMITS.batch)
        const vectors = await embedder.embed(
          batch.map((item) => item.text),
          EMBEDDING_PURPOSES.retrieval,
        )
        for (const [index, item] of batch.entries()) {
          await saveSkillVector(item.id, SkillEmbeddingPurpose.Retrieval, item.hash, vectors[index])
        }
        report.embeddedSkills += batch.length
        options.onProgress?.(
          `read ${report.embeddedSkills} of ${skillTodo.length} skills to search`,
        )
      }
      for (let start = 0; start < ruleTodo.length; start += SKILL_TOPIC_LIMITS.batch) {
        const batch = ruleTodo.slice(start, start + SKILL_TOPIC_LIMITS.batch)
        const vectors = await embedder.embed(
          batch.map((item) => item.text),
          EMBEDDING_PURPOSES.rule,
        )
        for (const [index, item] of batch.entries()) {
          await db.rawQuery(
            `insert into rule_embeddings (slot, rule_id, hash, vector, created_at)
             values (?, ?, ?, ?, now())
             on conflict (slot, rule_id) do update
             set hash = excluded.hash, vector = excluded.vector, created_at = excluded.created_at`,
            [item.slot, item.rule.id, item.hash, vectors[index]],
          )
        }
        report.embeddedRules += batch.length
        options.onProgress?.(`read ${report.embeddedRules} of ${ruleTodo.length} rules`)
      }
    })
  }

  const skillVectors = new Map<number, number[]>(
    (
      await db
        .from('skill_embeddings')
        .where('purpose', SkillEmbeddingPurpose.Retrieval)
        .whereIn(
          'skill_id',
          skills.map((item) => item.id),
        )
        .select('skill_id', 'vector')
    ).map((row: { skill_id: number; vector: number[] }) => [row.skill_id, row.vector]),
  )
  const ruleVectors = new Map<string, number[]>(
    (await db.from('rule_embeddings').select('slot', 'rule_id', 'vector')).map(
      (row: { slot: string; rule_id: string; vector: number[] }) => [
        `${row.slot}/${row.rule_id}`,
        row.vector,
      ],
    ),
  )
  const scored = skills.filter((item) => skillVectors.has(item.id))
  const scoredRuleList = rules.filter((item) => ruleVectors.has(`${item.slot}/${item.rule.id}`))
  // cosines[skill][rule]: both are normalized, so the cosine is the dot product.
  const cosines = scored.map((item) => {
    const vector = skillVectors.get(item.id) as number[]
    return scoredRuleList.map((rule) =>
      dot(vector, ruleVectors.get(`${rule.slot}/${rule.rule.id}`) as number[]),
    )
  })

  const proposed = new Set<string>()
  scoredRuleList.forEach((_, r) => {
    for (const s of topIndexes(
      cosines.map((row) => row[r]),
      SKILL_RULE_SCORING.ruleTop,
    )) {
      proposed.add(`${s} ${r}`)
    }
  })
  scored.forEach((_, s) => {
    for (const r of topIndexes(cosines[s], SKILL_RULE_SCORING.skillTop)) proposed.add(`${s} ${r}`)
  })

  const root = new Map<number, number>()
  const duplicates: { skill_id: number; duplicate_of: number }[] = []
  for (let j = 0; j < scored.length; j++) {
    for (let i = 0; i < j; i++) {
      if (
        dot(
          skillVectors.get(scored[i].id) as number[],
          skillVectors.get(scored[j].id) as number[],
        ) >= SKILL_RULE_SCORING.nearDuplicate
      ) {
        const first = root.get(scored[i].id) ?? scored[i].id
        root.set(scored[j].id, first)
        duplicates.push({ skill_id: scored[j].id, duplicate_of: first })
        break
      }
    }
  }

  await db.transaction(async (trx) => {
    await trx.from('skill_rule_scores').delete()
    const scores = scored.flatMap((item, s) =>
      scoredRuleList.flatMap((rule, r) =>
        cosines[s][r] >= SKILL_RULE_SCORING.scoreFloor
          ? [{ skill_id: item.id, slot: rule.slot, rule_id: rule.rule.id, cosine: cosines[s][r] }]
          : [],
      ),
    )
    for (let start = 0; start < scores.length; start += 1000) {
      await trx.table('skill_rule_scores').multiInsert(scores.slice(start, start + 1000))
    }
    report.scores = scores.length

    await trx.from('skill_near_duplicates').delete()
    if (duplicates.length > 0) await trx.table('skill_near_duplicates').multiInsert(duplicates)
    report.duplicates = duplicates.length

    // An admin's decision made between reading the decided pairs and inserting the pending ones
    // would collide with a pending row: it waits for this transaction instead.
    await trx.rawQuery('lock table skill_affinity_reviews in share row exclusive mode')
    const decided = new Set(
      (
        await trx
          .from('skill_affinity_reviews')
          .whereNotNull('decision')
          .select('skill_id', 'slot', 'rule_id')
      ).map(
        (row: { skill_id: number; slot: string; rule_id: string }) =>
          `${row.skill_id} ${row.slot}/${row.rule_id}`,
      ),
    )
    const pending = [...proposed].flatMap((pair) => {
      const [s, r] = pair.split(' ').map(Number)
      const item = scored[s]
      const rule = scoredRuleList[r]
      if (written(item.skill, rule.slot, rule.rule.id)) return []
      if (decided.has(`${item.id} ${rule.slot}/${rule.rule.id}`)) return []
      return [{ skill_id: item.id, slot: rule.slot, rule_id: rule.rule.id, cosine: cosines[s][r] }]
    })
    await trx.from('skill_affinity_reviews').whereNull('decision').delete()
    const now = new Date()
    for (let start = 0; start < pending.length; start += 1000) {
      await trx
        .table('skill_affinity_reviews')
        .multiInsert(pending.slice(start, start + 1000).map((row) => ({ ...row, created_at: now })))
    }
    report.pending = pending.length

    await trx.rawQuery(
      `insert into skill_scoring_state (id, hash, scored_at) values (1, ?, now())
       on conflict (id) do update set hash = excluded.hash, scored_at = excluded.scored_at`,
      [scoringHash()],
    )
  })
  return report
}

/** Whether a written affinity of the skill already names the rule, fitted or gone against. */
function written(skill: Skill, slot: string, rule: string): boolean {
  return skill.affinities.some(
    (affinity) =>
      isSlotAffinity(affinity) &&
      affinity.slot === slot &&
      (affinity.values.includes(rule) || (affinity.against?.includes(rule) ?? false)),
  )
}

function dot(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

/** The indexes of the `count` highest values, the highest first, the lower index on a tie. */
function topIndexes(values: number[], count: number): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.index)
}

/**
 * The computed affinities `matchSkills` reads, or null when they must not be used: the last
 * finished run scored another model or catalog, or `COMPUTED_AFFINITY_THRESHOLD` was measured
 * for another model than `SKILL_EMBEDDING_MODEL`. Skills are named by slug, as the catalog does.
 */
export async function loadComputedAffinities(): Promise<ComputedAffinities | null> {
  if (COMPUTED_AFFINITY_THRESHOLD.model !== SKILL_EMBEDDING_MODEL_KEY) return null
  if (!(await scoringIsCurrent())) return null
  const slugs = new Map<number, string>(
    (await db.from('skills').select('id', 'slug')).map((row: { id: number; slug: string }) => [
      row.id,
      row.slug,
    ]),
  )
  const cosines = new Map<string, number>()
  for (const row of (await db
    .from('skill_rule_scores')
    .select('skill_id', 'slot', 'rule_id', 'cosine')) as {
    skill_id: number
    slot: string
    rule_id: string
    cosine: number
  }[]) {
    const slug = slugs.get(row.skill_id)
    if (slug) cosines.set(pairKey(slug, row.slot, row.rule_id), row.cosine)
  }
  const decisions = new Map<string, AffinityDecision>()
  for (const row of (await db
    .from('skill_affinity_reviews')
    .whereNotNull('decision')
    .select('skill_id', 'slot', 'rule_id', 'decision')) as {
    skill_id: number
    slot: string
    rule_id: string
    decision: AffinityDecision
  }[]) {
    const slug = slugs.get(row.skill_id)
    if (slug) decisions.set(pairKey(slug, row.slot, row.rule_id), row.decision)
  }
  const duplicateOf = new Map<string, string>()
  for (const row of (await db.from('skill_near_duplicates').select('skill_id', 'duplicate_of')) as {
    skill_id: number
    duplicate_of: number
  }[]) {
    const skill = slugs.get(row.skill_id)
    const first = slugs.get(row.duplicate_of)
    if (skill && first) duplicateOf.set(skill, first)
  }
  return {
    threshold: COMPUTED_AFFINITY_THRESHOLD.value,
    cosine: (skillId, slot, rule) => cosines.get(pairKey(skillId, slot, rule)),
    decisions,
    duplicateOf,
  }
}

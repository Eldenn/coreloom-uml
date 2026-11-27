import db from '@adonisjs/lucid/services/db'
import {
  type AffinityDecision,
  COMPUTED_AFFINITY_THRESHOLD,
  RULE_PACKS,
} from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { paginate } from '#app/shared/pagination/paginate'
import type { AffinityReviewStatus } from '#app/skills/constants/skill-affinities'
import { isValueRule } from '#app/skills/services/skill-rule-scores'
import type { AffinityReviewOutput } from '#app/skills/validators/skills-output'
import type User from '#app/users/models/user'

/** Whether the review of computed affinities is on (`computed-skill-affinities`): off, 404. */
export function affinityReviewsEnabled(user: User): Promise<boolean> {
  return isFeatureEnabled(FeatureFlagKey.ComputedSkillAffinities, user)
}

type RuleInfo = Pick<AffinityReviewOutput, 'group' | 'rule' | 'noAutomaticSuggestion'>

/** Every scored rule of the current catalog, by `slot/rule`: a pair of a rule gone is not listed. */
function currentRules(): Map<string, RuleInfo> {
  const rules = new Map<string, RuleInfo>()
  for (const pack of RULE_PACKS) {
    for (const group of pack.groups) {
      for (const rule of group.rules) {
        if (isValueRule(rule)) continue
        const text = rule.lines.join(' ')
        rules.set(`${group.slot}/${rule.id}`, {
          group: group.label,
          rule: rule.label ?? { en: text, fr: text },
          noAutomaticSuggestion: rule.noAutomaticSuggestion === true,
        })
      }
    }
  }
  return rules
}

type ReviewRow = {
  id: number
  slug: string
  name: string
  slot: string
  rule_id: string
  cosine: number
  decision: AffinityDecision | null
  decided_at: Date | null
}

/**
 * The pairs the scoring proposed, in the order where the first decisions count most: the pairs
 * shown by themselves (a rule not marked `noAutomaticSuggestion`, at the threshold or above), then
 * the skills no written affinity ties to a rule, then by cosine; ties by skill, slot and rule.
 */
export async function listAffinityReviews(filters: {
  status?: AffinityReviewStatus
  skill?: string
  page?: number
  perPage?: number
}) {
  const rules = currentRules()
  const values = [...rules.entries()].map(([key, info]) => {
    const [slot, ruleId] = key.split('/')
    return [slot, ruleId, info.noAutomaticSuggestion]
  })
  const query = db
    .from('skill_affinity_reviews as r')
    .join('skills as s', 's.id', 'r.skill_id')
    .joinRaw(
      `join (values ${values.map(() => '(?, ?, ?::boolean)').join(', ')}) as rules(slot, rule_id, marked)
       on rules.slot = r.slot and rules.rule_id = r.rule_id`,
      values.flat(),
    )
    .select(
      'r.id',
      's.slug',
      's.name',
      'r.slot',
      'r.rule_id',
      'r.cosine',
      'r.decision',
      'r.decided_at',
    )
    .orderByRaw('case when not rules.marked and r.cosine >= ? then 0 else 1 end', [
      COMPUTED_AFFINITY_THRESHOLD.value,
    ])
    .orderByRaw(
      `case when exists (
         select 1 from jsonb_array_elements(s.affinities) as a where a->>'slot' is not null
       ) then 1 else 0 end`,
    )
    .orderBy('r.cosine', 'desc')
    .orderBy('r.skill_id')
    .orderBy('r.slot')
    .orderBy('r.rule_id')
  const status = filters.status ?? 'pending'
  if (status === 'pending') query.whereNull('r.decision')
  if (status === 'decided') query.whereNotNull('r.decision')
  if (filters.skill) query.where('s.slug', filters.skill)

  return paginate(query, filters, (row: ReviewRow): AffinityReviewOutput => {
    const info = rules.get(`${row.slot}/${row.rule_id}`) as RuleInfo
    return {
      id: row.id,
      skill: { slug: row.slug, name: row.name },
      slot: row.slot,
      ruleId: row.rule_id,
      ...info,
      cosine: row.cosine,
      shownByItself: !info.noAutomaticSuggestion && row.cosine >= COMPUTED_AFFINITY_THRESHOLD.value,
      decision: row.decision,
      decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
    }
  })
}

/** Sets the admin's decision on a pair, or `null` to put it back among the pending ones. */
export async function decideAffinity(
  id: number,
  decision: AffinityDecision | null,
): Promise<boolean> {
  const updated = await db
    .from('skill_affinity_reviews')
    .where('id', id)
    .update({ decision, decided_at: decision ? new Date() : null }, ['id'])
  return updated.length > 0
}

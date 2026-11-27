import { acceptedProblem, ruleTitle } from './ready-rules.ts'
import {
  type AcceptedRule,
  type AuditRisk,
  isSlotAffinity,
  type Localized,
  type RuleGroup,
  type RulePack,
  type Skill,
} from './schemas.ts'
import type { Slot } from './slots.ts'
import type { Target } from './targets.ts'
import { type Topic, topicsOfSlots } from './topics.ts'

/** At most this many skills are suggested as compatible, and this many as conflicting. */
export const COMPATIBLE_SKILLS_MAX = 5
export const CONFLICTING_SKILLS_MAX = 3

/** Why a skill goes against a rule the configuration holds. */
export type SkillReason = {
  slot: Slot
  questionLabel: Localized
  yourAnswer: Localized
  skillExpects: Localized
}

/**
 * A skill as a generation stores it: a copy of its catalog entry, so an older generation keeps
 * showing what was suggested then, with its score and, when it conflicts, the reasons.
 */
export type SkillSuggestion = {
  id: string
  name: string
  description: Localized
  url: string
  targets: Target[]
  score: number
  reasons: SkillReason[]
  /** The registry's security audits when the search found it; empty for a manual entry. */
  audits: { provider: string; risk: AuditRisk; analyzedAt: string }[]
}

export type SkillSuggestions = {
  compatible: SkillSuggestion[]
  conflicting: SkillSuggestion[]
}

/**
 * The cosine at which a skill and a rule count as an affinity, for the one model it was measured
 * with: the lowest cosine at which at most 10 % of the rules that call for no skill got one, in
 * repeated cross-validation, confirmed once on 100 rules drawn at random
 * (`infra/skill-tagger/study/`). A pair scored by any other model gets no computed affinity.
 */
export const COMPUTED_AFFINITY_THRESHOLD = {
  model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX@c25a394dd583836952667c12f008335071b3f43d:fp32',
  value: 0.656,
} as const

/**
 * What the admin decided about a skill and a rule: it fits (+1, like a written affinity), it
 * does not (no computed affinity), or the skill goes against it (a conflict, like `against`).
 */
export type AffinityDecision = 'accepted' | 'rejected' | 'against'

/** Affinities computed from text similarity, and what the admin decided about them. */
export type ComputedAffinities = {
  threshold: number
  /** A skill's cosine with a rule; undefined when none was stored. */
  cosine: (skillId: string, slot: string, rule: string) => number | undefined
  /** The admin's decisions, by `pairKey`. */
  decisions: ReadonlyMap<string, AffinityDecision>
  /** For a skill nearly identical to another, the one of the pair that comes first in the catalog. */
  duplicateOf: ReadonlyMap<string, string>
}

/** The key of a skill and a rule in `ComputedAffinities.decisions`. */
export function pairKey(skillId: string, slot: string, rule: string): string {
  return `${skillId} ${slot}/${rule}`
}

export type SkillMatchInput = {
  /** The catalog's rule packs. */
  packs: readonly RulePack[]
  /** The ready-made rules the configuration holds. */
  ready: readonly AcceptedRule[]
  targets: readonly Target[]
  /** The kinds of the project's diagrams, in any order, repeats allowed. */
  diagramKinds: readonly string[]
  /** With them, see `matchSkills`; without them, it matches as it always did. */
  computed?: ComputedAffinities
}

/**
 * Suggests skills from the ready-made rules held, deterministically. For each affinity whose
 * slot holds a rule: −1 when one of them is among the rules the skill goes against, +1 when one
 * is among the rules it fits, 0 otherwise. A diagram affinity counts +1 when the project holds a
 * diagram of one of its kinds, 0 otherwise. Tags are a weak signal: a skill sharing a tag with
 * the slots held (`topicsOfSlots`) is compatible even at 0, never conflicting. A skill is
 * compatible with a score of 1 or more, or a shared tag, and no −1, and conflicting as soon as
 * it has a −1. Only skills that load in one of the configuration's targets are suggested.
 * Compatible skills come by score, then by tags shared, conflicting ones by number of reasons,
 * then both in catalog order.
 *
 * With `computed`, each held rule a written affinity does not already fit also counts +1 when the
 * admin accepted the pair, or when its cosine reaches the threshold, the rule is not marked
 * `noAutomaticSuggestion` and the admin did not reject the pair; a pair the admin marked
 * `against` is a conflict, like a written `against`. A computed pair never makes a conflict by
 * itself. Tags no longer make a skill compatible alone: it needs a score of 1. Compatible skills
 * come by score, then by their best cosine with the rules held, then by tags shared, then in
 * catalog order, and a skill whose near duplicate is already listed is skipped.
 */
export function matchSkills(input: SkillMatchInput, skills: readonly Skill[]): SkillSuggestions {
  const bySlot = heldSlots(input)
  const topics = new Set(topicsOfSlots(bySlot.keys()))
  const { computed } = input
  const shared = new Map<SkillSuggestion, number>()
  const best = new Map<SkillSuggestion, number>()
  const compatible: SkillSuggestion[] = []
  const conflicting: SkillSuggestion[] = []

  for (const skill of skills) {
    if (!skill.targets.some((target) => input.targets.includes(target))) continue
    let score = 0
    let bestCosine = Number.NEGATIVE_INFINITY
    const reasons: SkillReason[] = []
    const fitted = new Set<string>()
    for (const affinity of skill.affinities) {
      if (!isSlotAffinity(affinity)) {
        if (affinity.diagramKinds.some((kind) => input.diagramKinds.includes(kind))) score += 1
        continue
      }
      const slot = bySlot.get(affinity.slot)
      if (!slot) continue
      const { group, held } = slot
      const opposed = held.find((id) => affinity.against?.includes(id))
      if (opposed !== undefined) {
        score -= 1
        reasons.push({
          slot: affinity.slot as Slot,
          questionLabel: group.label,
          yourAnswer: titleOf(group, [opposed]),
          skillExpects: titleOf(group, affinity.values),
        })
      } else if (held.some((id) => affinity.values.includes(id))) {
        score += 1
        for (const id of held) {
          if (affinity.values.includes(id)) fitted.add(`${affinity.slot}/${id}`)
        }
      }
    }
    if (computed) {
      for (const [slot, { group, held }] of bySlot) {
        for (const id of held) {
          if (fitted.has(`${slot}/${id}`)) continue
          const rule = group.rules.find((candidate) => candidate.id === id)
          const decision = computed.decisions.get(pairKey(skill.id, slot, id))
          const cosine = computed.cosine(skill.id, slot, id)
          if (decision === 'against') {
            score -= 1
            reasons.push({
              slot: slot as Slot,
              questionLabel: group.label,
              yourAnswer: titleOf(group, [id]),
              skillExpects: titleOf(
                group,
                group.rules.filter((other) => other.id !== id && !other.input).map((r) => r.id),
              ),
            })
            continue
          }
          if (decision === 'rejected') continue
          const automatic = !rule?.noAutomaticSuggestion && cosine !== undefined
          if (automatic) bestCosine = Math.max(bestCosine, cosine)
          if (decision === 'accepted' || (automatic && cosine >= computed.threshold)) score += 1
        }
      }
    }
    const suggestion: SkillSuggestion = {
      id: skill.id,
      name: skill.name,
      description: { en: skill.description.en, fr: skill.description.fr ?? skill.description.en },
      url: skill.url,
      targets: [...skill.targets],
      score,
      reasons,
      audits: skill.provenance?.audits.map((audit) => ({ ...audit })) ?? [],
    }
    const tags = skill.topics?.filter((topic) => topics.has(topic)).length ?? 0
    if (reasons.length > 0) conflicting.push(suggestion)
    else if (score >= 1 || (!computed && tags > 0)) {
      compatible.push(suggestion)
      shared.set(suggestion, tags)
      best.set(suggestion, bestCosine)
    }
  }

  // Array.prototype.sort is stable, so ties keep the catalog order.
  const sorted = computed
    ? compatible.sort(
        (a, b) =>
          b.score - a.score ||
          byCosine(best.get(a), best.get(b)) ||
          (shared.get(b) ?? 0) - (shared.get(a) ?? 0),
      )
    : compatible.sort((a, b) => b.score - a.score || (shared.get(b) ?? 0) - (shared.get(a) ?? 0))
  return {
    compatible: (computed ? withoutDuplicates(sorted, computed.duplicateOf) : sorted).slice(
      0,
      COMPATIBLE_SKILLS_MAX,
    ),
    conflicting: conflicting
      .sort((a, b) => b.reasons.length - a.reasons.length)
      .slice(0, CONFLICTING_SKILLS_MAX),
  }
}

/** The higher cosine first; a skill without one (−∞) after every skill with one. */
function byCosine(a = Number.NEGATIVE_INFINITY, b = Number.NEGATIVE_INFINITY): number {
  return a === b ? 0 : b > a ? 1 : -1
}

/** Keeps the first skill of each pair of near duplicates, in the order given. */
function withoutDuplicates(
  skills: SkillSuggestion[],
  duplicateOf: ReadonlyMap<string, string>,
): SkillSuggestion[] {
  const seen = new Set<string>()
  return skills.filter((skill) => {
    const group = duplicateOf.get(skill.id) ?? skill.id
    if (seen.has(group)) return false
    seen.add(group)
    return true
  })
}

/** The tags of the slots whose rules the configuration holds (see `heldSlots`). */
export function heldTopics(input: Pick<SkillMatchInput, 'packs' | 'ready'>): Topic[] {
  return topicsOfSlots(heldSlots(input).keys())
}

type HeldSlot = { group: RuleGroup; held: string[] }

/** Each slot's group and the ids of its rules held; rules that cannot be held together are left out. */
function heldSlots(input: Pick<SkillMatchInput, 'packs' | 'ready'>): Map<string, HeldSlot> {
  const slots = new Map<string, HeldSlot>()
  for (const pack of input.packs) {
    for (const group of pack.groups) {
      const accepted = input.ready.filter((item) => item.slot === group.slot)
      if (accepted.length === 0 || acceptedProblem(group, accepted) !== null) continue
      slots.set(group.slot, { group, held: accepted.map((item) => item.rule) })
    }
  }
  return slots
}

/** The names of these rules of the group, in the group's order. */
function titleOf(group: RuleGroup, ids: readonly string[]): Localized {
  const titles = group.rules
    .filter((rule) => ids.includes(rule.id))
    .map((rule) => ruleTitle(group, rule))
  return {
    en: titles.map((title) => title.en).join(' / '),
    fr: titles.map((title) => title.fr).join(' / '),
  }
}

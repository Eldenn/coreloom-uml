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

export type SkillMatchInput = {
  /** The catalog's rule packs. */
  packs: readonly RulePack[]
  /** The ready-made rules the configuration holds. */
  ready: readonly AcceptedRule[]
  targets: readonly Target[]
  /** The kinds of the project's diagrams, in any order, repeats allowed. */
  diagramKinds: readonly string[]
}

/**
 * Suggests skills from the ready-made rules held, deterministically. For each affinity whose
 * slot holds a rule: −1 when one of them is among the rules the skill goes against, +1 when one
 * is among the rules it fits, 0 otherwise. A diagram affinity counts +1 when the project holds a
 * diagram of one of its kinds, 0 otherwise. A skill is compatible with a score of 1 or more and
 * no −1, and conflicting as soon as it has a −1. Only skills that load in one of the
 * configuration's targets are suggested. Compatible skills come by score, conflicting ones by
 * number of reasons, then both in catalog order.
 */
export function matchSkills(input: SkillMatchInput, skills: readonly Skill[]): SkillSuggestions {
  const bySlot = heldSlots(input)
  const compatible: SkillSuggestion[] = []
  const conflicting: SkillSuggestion[] = []

  for (const skill of skills) {
    if (!skill.targets.some((target) => input.targets.includes(target))) continue
    let score = 0
    const reasons: SkillReason[] = []
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
    if (reasons.length > 0) conflicting.push(suggestion)
    else if (score >= 1) compatible.push(suggestion)
  }

  // Array.prototype.sort is stable, so ties keep the catalog order.
  return {
    compatible: compatible.sort((a, b) => b.score - a.score).slice(0, COMPATIBLE_SKILLS_MAX),
    conflicting: conflicting
      .sort((a, b) => b.reasons.length - a.reasons.length)
      .slice(0, CONFLICTING_SKILLS_MAX),
  }
}

type HeldSlot = { group: RuleGroup; held: string[] }

/** Each slot's group and the ids of its rules held; rules that cannot be held together are left out. */
function heldSlots(input: SkillMatchInput): Map<string, HeldSlot> {
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

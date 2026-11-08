import { answerProblem } from './answers.ts'
import {
  type AnswerValue,
  type Localized,
  type Question,
  type Questionnaire,
  SCALE_MAX,
  type Skill,
  type SkillAffinity,
} from './schemas.ts'
import { SKILLS } from './skills.ts'
import type { Slot } from './slots.ts'
import type { Target } from './targets.ts'

/** At most this many skills are suggested as compatible, and this many as conflicting. */
export const COMPATIBLE_SKILLS_MAX = 5
export const CONFLICTING_SKILLS_MAX = 3

/** Why a skill goes against an answer. */
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
}

export type SkillSuggestions = {
  compatible: SkillSuggestion[]
  conflicting: SkillSuggestion[]
}

export type SkillMatchInput = {
  /** Resolved from the catalog, in the configuration's order. */
  questionnaires: readonly Questionnaire[]
  /** Already migrated to the questionnaires' current version. */
  answers: readonly { questionnaireId: string; questionId: string; value: AnswerValue }[]
  targets: readonly Target[]
}

/** A gap of this much between a scale answer and a skill's range is a contradiction. */
const CONFLICT_GAP = 2

/**
 * Suggests skills from the answers, deterministically. For each affinity whose slot has an
 * answer: +1 when the answer is in the range or among the values; −1 when the question is a
 * scale and the answer is 2 or more away from the range; 0 otherwise. A skill is compatible
 * with a score of 1 or more and no −1, and conflicting as soon as it has a −1. Only skills that
 * load in one of the configuration's targets are suggested. Compatible skills come by score,
 * conflicting ones by number of reasons, then both in catalog order.
 */
export function matchSkills(
  input: SkillMatchInput,
  skills: readonly Skill[] = SKILLS,
): SkillSuggestions {
  const bySlot = answeredSlots(input)
  const compatible: SkillSuggestion[] = []
  const conflicting: SkillSuggestion[] = []

  for (const skill of skills) {
    if (!skill.targets.some((target) => input.targets.includes(target))) continue
    let score = 0
    const reasons: SkillReason[] = []
    for (const affinity of skill.affinities) {
      const answered = bySlot.get(affinity.slot)
      if (!answered) continue
      const points = affinityScore(affinity, answered.value)
      score += points
      if (points < 0 && affinity.scale && typeof answered.value === 'number') {
        reasons.push({
          slot: affinity.slot as Slot,
          questionLabel: answered.question.label,
          yourAnswer: scaleText(answered.value, answered.value),
          skillExpects: scaleText(affinity.scale.min, affinity.scale.max),
        })
      }
    }
    const suggestion: SkillSuggestion = {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      url: skill.url,
      targets: [...skill.targets],
      score,
      reasons,
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

type AnsweredSlot = { question: Question; value: AnswerValue }

/** Each slot's question and answer; answers that do not fit their question are left out. */
function answeredSlots(input: SkillMatchInput): Map<string, AnsweredSlot> {
  const slots = new Map<string, AnsweredSlot>()
  for (const answer of input.answers) {
    const questionnaire = input.questionnaires.find((item) => item.id === answer.questionnaireId)
    const question = questionnaire?.questions.find((item) => item.id === answer.questionId)
    if (!question || answerProblem(question, answer.value) !== null) continue
    slots.set(question.slot, { question, value: answer.value })
  }
  return slots
}

function affinityScore(affinity: SkillAffinity, value: AnswerValue): number {
  if (affinity.scale) {
    if (typeof value !== 'number') return 0
    const { min, max } = affinity.scale
    if (value >= min && value <= max) return 1
    const gap = value < min ? min - value : value - max
    return gap >= CONFLICT_GAP ? -1 : 0
  }
  const picked = Array.isArray(value) ? value : [value]
  return picked.some((item) => typeof item === 'string' && affinity.values?.includes(item)) ? 1 : 0
}

function scaleText(min: number, max: number): Localized {
  return min === max
    ? { en: `${min} of ${SCALE_MAX}`, fr: `${min} sur ${SCALE_MAX}` }
    : { en: `${min} to ${max} of ${SCALE_MAX}`, fr: `${min} à ${max} sur ${SCALE_MAX}` }
}

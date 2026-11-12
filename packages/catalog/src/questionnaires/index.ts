import type { Localized, Questionnaire } from '../schemas.ts'
import { sectionOrder } from '../sections.ts'
import { aiAgents } from './ai-agents.ts'
import { aiEngineering } from './ai-engineering.ts'
import { backendNode } from './backend-node.ts'
import { frontendPerformance } from './frontend-performance.ts'
import { frontendReact } from './frontend-react.ts'
import { gitWorkflow } from './git-workflow.ts'
import { security } from './security.ts'
import { softwareDesign } from './software-design.ts'
import { systemDesign } from './system-design.ts'

/** Every questionnaire of the catalog, at its current version. */
export const QUESTIONNAIRES: readonly Questionnaire[] = [
  frontendReact,
  backendNode,
  gitWorkflow,
  security,
  systemDesign,
  softwareDesign,
  aiEngineering,
  aiAgents,
  frontendPerformance,
]

/** Labels of the ends of every agreement scale. */
export const SCALE_LABELS: { min: Localized; max: Localized } = {
  min: { en: 'Strongly disagree', fr: "Pas du tout d'accord" },
  max: { en: 'Strongly agree', fr: "Tout à fait d'accord" },
}

export function findQuestionnaire(id: string): Questionnaire | undefined {
  return QUESTIONNAIRES.find((questionnaire) => questionnaire.id === id)
}

export type Composition =
  | { ok: true; questionnaires: Questionnaire[]; sections: string[] }
  | { ok: false; problems: string[] }

/**
 * Checks that questionnaires can be combined in one configuration: each is named once and no
 * slot is fed by two of them. On success, returns them in the given order with the sections of
 * the combination, in render order.
 */
export function composeQuestionnaires(questionnaires: readonly Questionnaire[]): Composition {
  const problems: string[] = []
  const seen = new Set<string>()
  const slotOwners = new Map<string, string>()
  for (const questionnaire of questionnaires) {
    if (seen.has(questionnaire.id)) problems.push(`${questionnaire.id} is listed twice`)
    seen.add(questionnaire.id)
    for (const question of questionnaire.questions) {
      const owner = slotOwners.get(question.slot)
      if (owner !== undefined && owner !== questionnaire.id) {
        problems.push(`${question.slot} is fed by both ${owner} and ${questionnaire.id}`)
      }
      slotOwners.set(question.slot, questionnaire.id)
    }
  }
  if (questionnaires.length === 0) problems.push('At least one questionnaire is needed')
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, questionnaires: [...questionnaires], sections: sectionOrder(questionnaires) }
}

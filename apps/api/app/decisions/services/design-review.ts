import { DecisionStatus } from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import { reviewed } from '#app/decisions/services/agent-proposals'
import { withLinks } from '#app/decisions/services/decision-writes'
import { RequirementPriority } from '#app/requirements/constants/requirement'
import Requirement from '#app/requirements/models/requirement'

/** What the records of a project say against themselves, read without any model. */
export const DesignFindingKind = {
  /** A requirement that must hold, which no accepted decision serves. */
  UnservedRequirement: 'unserved_requirement',
  /** An accepted decision that names no view: nothing shows where it applies. */
  DecisionWithoutDiagram: 'decision_without_diagram',
  /** A superseded decision still named on views: they show a choice that no longer holds. */
  SupersededStillLinked: 'superseded_still_linked',
} as const
export type DesignFindingKind = (typeof DesignFindingKind)[keyof typeof DesignFindingKind]

/** One finding: its kind and the requirement or decision it is about, with its text. */
export type DesignFinding = {
  kind: DesignFindingKind
  requirementId: number | null
  decisionId: number | null
  subject: string
}

type ReviewedRequirement = { id: number; priority: RequirementPriority; statement: string }
type ReviewedDecision = {
  id: number
  title: string
  status: DecisionStatus
  requirementIds: number[]
  diagramIds: number[]
}

/** The findings of a project's records, requirements first: same input, same output. */
export function reviewDesign(
  requirements: ReviewedRequirement[],
  decisions: ReviewedDecision[],
): DesignFinding[] {
  const accepted = decisions.filter((decision) => decision.status === DecisionStatus.Accepted)
  const served = new Set(accepted.flatMap((decision) => decision.requirementIds))
  const about = (kind: DesignFindingKind, { id, title }: ReviewedDecision): DesignFinding => ({
    kind,
    requirementId: null,
    decisionId: id,
    subject: title,
  })
  return [
    ...requirements
      .filter(({ id, priority }) => priority === RequirementPriority.Must && !served.has(id))
      .map(({ id, statement }) => ({
        kind: DesignFindingKind.UnservedRequirement,
        requirementId: id,
        decisionId: null,
        subject: statement,
      })),
    ...accepted
      .filter((decision) => decision.diagramIds.length === 0)
      .map((decision) => about(DesignFindingKind.DecisionWithoutDiagram, decision)),
    ...decisions
      .filter(({ status, diagramIds }) => status === DecisionStatus.Superseded && diagramIds.length)
      .map((decision) => about(DesignFindingKind.SupersededStillLinked, decision)),
  ]
}

/** The findings of the project with this id, from its stored requirements and decisions. */
export async function projectDesignFindings(projectId: number): Promise<DesignFinding[]> {
  const [requirements, decisions] = await Promise.all([
    Requirement.query().where('projectId', projectId).orderBy('id', 'asc'),
    withLinks(reviewed(Decision.query().where('projectId', projectId))).orderBy('id', 'asc'),
  ])
  return reviewDesign(
    requirements,
    decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      status: decision.status,
      requirementIds: decision.requirements.map((requirement) => requirement.id),
      diagramIds: decision.diagrams.map((diagram) => diagram.id),
    })),
  )
}

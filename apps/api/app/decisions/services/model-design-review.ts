import db from '@adonisjs/lucid/services/db'
import type { DesignReviewResult, DesignReviewSource } from '@coreloom-uml/llm'
import { toPlantUml } from '@coreloom-uml/uml'
import type Architecture from '#app/architectures/models/architecture'
import { CodeReviewResolution } from '#app/code-reviews/constants/code-review'
import { DecisionStatus } from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import DesignFinding from '#app/decisions/models/design-finding'
import { reviewed } from '#app/decisions/services/agent-proposals'
import type { DesignModelFindingOutput } from '#app/decisions/validators/decisions-output'
import Diagram from '#app/diagrams/models/diagram'
import Requirement from '#app/requirements/models/requirement'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

/** Why an architecture cannot be reviewed now: nothing to read it against, or nothing drawn. */
export const DesignReviewProblem = {
  NoRecord: 'The project has no requirement and no decision to review against.',
  NoView: 'The architecture has no view with content to review.',
} as const

/**
 * What the model reads about an architecture of a project: its views with content, in order, as
 * PlantUML without layout, the project's requirements (the ones that must hold first) and its
 * decisions still standing. A problem when there is nothing to compare.
 */
export async function designReviewSource(
  architecture: Architecture & { projectId: number },
  locale: DesignReviewSource['locale'],
): Promise<DesignReviewSource | { problem: string }> {
  const [requirements, decisions, diagrams] = await Promise.all([
    Requirement.query()
      .where('projectId', architecture.projectId)
      .orderBy('priority', 'asc')
      .orderBy('id', 'asc'),
    reviewed(Decision.query().where('projectId', architecture.projectId))
      .whereNot('status', DecisionStatus.Superseded)
      .orderBy('status', 'asc')
      .orderBy('id', 'asc'),
    Diagram.query().where('architectureId', architecture.id).orderBy('position', 'asc'),
  ])
  if (requirements.length === 0 && decisions.length === 0)
    return { problem: DesignReviewProblem.NoRecord }
  const views = diagrams.flatMap(({ id, kind, title, content }) =>
    content ? [{ id, kind, title, text: toPlantUml(content, { layout: false }) }] : [],
  )
  if (views.length === 0) return { problem: DesignReviewProblem.NoView }

  return {
    architecture: { title: architecture.title },
    views,
    requirements: requirements.map(({ id, priority, category, statement, measure }) => ({
      id,
      priority,
      category,
      statement,
      measure,
    })),
    decisions: decisions.map(({ id, status, title, chosen, consequences }) => ({
      id,
      status,
      title,
      chosen,
      consequences,
    })),
    locale,
  }
}

/** Replaces the findings of an architecture by those of a new review: the earlier ones go. */
export async function storeDesignFindings(
  architecture: Architecture & { projectId: number },
  findings: DesignReviewResult['findings'],
): Promise<DesignFinding[]> {
  return db.transaction(async (client) => {
    await DesignFinding.query({ client }).where('architectureId', architecture.id).delete()
    if (findings.length === 0) return []
    return DesignFinding.createMany(
      findings.map((finding) => ({
        ...finding,
        projectId: architecture.projectId,
        userId: architecture.userId,
        architectureId: architecture.id,
        resolution: CodeReviewResolution.Open,
      })),
      { client },
    )
  })
}

/** The model's findings of a project, by architecture then as the model gave them. */
export function projectModelFindings(projectId: number): Promise<DesignFinding[]> {
  return DesignFinding.query()
    .where('projectId', projectId)
    .orderBy('architectureId', 'asc')
    .orderBy('id', 'asc')
}

/** The finding with this id if `user` owns it, else null: callers answer 404 either way. */
export async function findOwnedDesignFinding(
  id: number,
  user: User,
): Promise<DesignFinding | null> {
  const finding = await DesignFinding.find(id)
  return finding && assertOwner(finding, user) ? finding : null
}

export function serializeDesignFinding(finding: DesignFinding): DesignModelFindingOutput {
  return {
    id: finding.id,
    architectureId: finding.architectureId,
    requirementId: finding.requirementId,
    decisionId: finding.decisionId,
    diagramId: finding.diagramId,
    severity: finding.severity,
    comment: finding.comment,
    resolution: finding.resolution,
    createdAt: finding.createdAt.toISO() ?? '',
  }
}

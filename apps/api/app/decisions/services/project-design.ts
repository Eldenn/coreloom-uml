import type { AgentContextProject } from '@coreloom-uml/catalog'
import type { DesignContext } from '@coreloom-uml/llm'
import type Architecture from '#app/architectures/models/architecture'
import { DecisionStatus } from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import Requirement from '#app/requirements/models/requirement'
import { designRecordsEnabled } from '#app/requirements/services/design-records-flag'
import User from '#app/users/models/user'

/**
 * What the assistant reads about the project of an architecture before it draws: its
 * requirements (the ones that must hold first) and its decisions still standing, the accepted
 * ones first. Null outside a project, while `design-records` is off for the owner, or when the
 * project has neither.
 */
export async function projectDesign(architecture: Architecture): Promise<DesignContext | null> {
  const { projectId } = architecture
  if (projectId === null) return null
  const owner = await User.findOrFail(architecture.userId)
  if (!(await designRecordsEnabled(owner))) return null

  const requirements = await Requirement.query()
    .where('projectId', projectId)
    .orderBy('priority', 'asc')
    .orderBy('id', 'asc')
  const decisions = await Decision.query()
    .where('projectId', projectId)
    .whereIn('status', [DecisionStatus.Accepted, DecisionStatus.Proposed])
    .orderBy('status', 'asc')
    .orderBy('id', 'asc')
  if (requirements.length === 0 && decisions.length === 0) return null

  return {
    requirements: requirements.map(({ priority, category, statement, measure }) => ({
      priority,
      category,
      statement,
      measure,
    })),
    decisions: decisions.map(({ title, status, chosen, consequences }) => ({
      title,
      status: status === DecisionStatus.Accepted ? 'accepted' : 'proposed',
      chosen,
      consequences,
    })),
  }
}

/**
 * What a project's generated agent files say of its design: its requirements (the ones that must
 * hold first) and its accepted decisions, oldest first. A key is left out when there is nothing
 * to say (no record, or `design-records` off for the owner), so the inputs a generation stores
 * stay what they were for a project that records none.
 */
export async function agentContextDesign(
  projectId: number,
  ownerId: number,
): Promise<Pick<AgentContextProject, 'requirements' | 'decisions'>> {
  if (!(await designRecordsEnabled(await User.findOrFail(ownerId)))) return {}
  const [requirements, decisions] = await Promise.all([
    Requirement.query()
      .where('projectId', projectId)
      .orderBy('priority', 'asc')
      .orderBy('id', 'asc'),
    Decision.query()
      .where('projectId', projectId)
      .where('status', DecisionStatus.Accepted)
      .orderBy('id', 'asc'),
  ])
  return {
    ...(requirements.length > 0 && {
      requirements: requirements.map(({ priority, statement, measure }) => ({
        priority,
        statement,
        measure,
      })),
    }),
    ...(decisions.length > 0 && {
      decisions: decisions.map(({ title, chosen, consequences }) => ({
        title,
        chosen,
        consequences,
      })),
    }),
  }
}

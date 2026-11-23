import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import { DecisionOrigin, DecisionStatus } from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'

/*
 * A coding agent's proposal (`origin: agent`, still `proposed`) waits for the owner's review and
 * counts for nothing until then: whatever reads the design for a model or an agent (prompts,
 * generated files, reviews, the MCP tools, the assistant's reads) reads through `reviewed`.
 * Only the owner's Design tab lists it, to keep or dismiss it.
 */

/** Leaves out the decisions of coding agents still waiting for the owner's review. */
export function reviewed(query: ModelQueryBuilderContract<typeof Decision>) {
  return query.whereNot((waiting) =>
    waiting.where('origin', DecisionOrigin.Agent).where('status', DecisionStatus.Proposed),
  )
}

/** Whether this decision is a coding agent's proposal still waiting for the owner's review. */
export function awaitsReview(decision: Pick<Decision, 'origin' | 'status'>): boolean {
  return decision.origin === DecisionOrigin.Agent && decision.status === DecisionStatus.Proposed
}

/** How many proposals of coding agents in this project wait for the owner's review. */
export async function waitingProposals(projectId: number): Promise<number> {
  const [row] = await Decision.query()
    .where({ projectId, origin: DecisionOrigin.Agent, status: DecisionStatus.Proposed })
    .count('* as total')
  return Number(row.$extras.total)
}

import { isDeepStrictEqual } from 'node:util'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import {
  type AssistantPage,
  type AssistantTool,
  type AssistantToolCall,
  AssistantToolKind,
} from '@coreloom-uml/llm'
import { z } from 'zod'
import { findOwnedAgentConfig } from '#app/agent-configs/services/owned-agent-config'
import { findOwnedArchitecture } from '#app/architectures/services/owned-architecture'
import { idInput, NOT_FOUND_SENTENCE, TARGET_NOT_FOUND } from '#app/assistant/actions/action'
import { currentState, findAction, isAvailable } from '#app/assistant/actions/registry'
import {
  ActionFailure,
  ActionStatus,
  AssistantRole,
  AssistantTargetKind,
  HandoffKind,
  type StoredAction,
} from '#app/assistant/constants/assistant'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { serializeAction } from '#app/assistant/serializers/assistant-serializer'
import type { ActionOutput, HandoffOutput } from '#app/assistant/validators/assistant-output'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { findOwnedProject } from '#app/projects/services/owned-project'
import { researchConfig } from '#app/research/services/research-config'
import type User from '#app/users/models/user'

/** Whether the plain message may read and propose actions (`diagram-assistant` is checked first). */
export function assistantActionsEnabled(user: User): Promise<boolean> {
  return isFeatureEnabled(FeatureFlagKey.AssistantActions, user)
}

/** The page the message was written from, named, if it is the caller's; else no page. */
export async function resolvePage(
  page: { kind: AssistantTargetKind; id: number } | undefined,
  user: User,
): Promise<AssistantPage | null> {
  if (!page) return null
  const name =
    page.kind === AssistantTargetKind.Project
      ? (await findOwnedProject(page.id, user))?.name
      : page.kind === AssistantTargetKind.Architecture
        ? (await findOwnedArchitecture(page.id, user))?.title
        : (await findOwnedAgentConfig(page.id, user))?.name
  return name === undefined ? null : { ...page, name }
}

const HandoffTool = { WorkOnDiagrams: 'work_on_diagrams', ResearchWeb: 'research_web' } as const

/**
 * The two route tools: the message goes to the diagram assistant of an architecture, or to a web
 * research for agent conventions (offered only while the research is available to the user). A
 * target that is not the caller's is refused, and the loop goes on.
 */
export async function handoffTools(user: User): Promise<AssistantTool[]> {
  const tools: AssistantTool[] = [
    {
      name: HandoffTool.WorkOnDiagrams,
      description:
        "Hands the message over to the diagram assistant of one of the owner's architectures, which reads and changes its views (diagrams). Use it for any work on diagrams.",
      inputSchema: z.object({ architectureId: idInput() }),
      kind: AssistantToolKind.Route,
      run: async (input) => {
        const { architectureId } = z.object({ architectureId: idInput() }).parse(input)
        return (await findOwnedArchitecture(architectureId, user)) ? null : NOT_FOUND_SENTENCE
      },
    },
  ]
  if (researchConfig() && (await isFeatureEnabled(FeatureFlagKey.WebResearch, user))) {
    tools.push({
      name: HandoffTool.ResearchWeb,
      description:
        "Hands the message over to a web research that reads the pages the owner names and proposes rules for one of the owner's agent conventions.",
      inputSchema: z.object({ agentConfigId: idInput() }),
      kind: AssistantToolKind.Route,
      run: async (input) => {
        const { agentConfigId } = z.object({ agentConfigId: idInput() }).parse(input)
        return (await findOwnedAgentConfig(agentConfigId, user)) ? null : NOT_FOUND_SENTENCE
      },
    })
  }
  return tools
}

/** The handoff a route tool call stands for. */
export function handoffOf(route: AssistantToolCall): HandoffOutput {
  const input = route.input as { architectureId?: number; agentConfigId?: number }
  if (route.name === HandoffTool.ResearchWeb)
    return { kind: HandoffKind.Web, agentConfigId: Number(input.agentConfigId) }
  return { kind: HandoffKind.Diagrams, architectureId: Number(input.architectureId) }
}

export const ActionDecision = { Accept: 'accept', Reject: 'reject' } as const
export type ActionDecision = (typeof ActionDecision)[keyof typeof ActionDecision]

export const ActionConflictCode = { NotPending: 'not_pending', Changed: 'changed' } as const
const CHANGED = {
  message: 'What this action changes is no longer what its card said: read it again.',
  code: ActionConflictCode.Changed,
} as const
const NOT_PENDING = {
  message: 'This action is no longer pending.',
  code: ActionConflictCode.NotPending,
} as const
const FAILURE_MESSAGES = {
  [ActionFailure.NotFound]: 'What this action targets no longer exists.',
  [ActionFailure.Invalid]: 'This action is not valid.',
  [ActionFailure.Conflict]: 'This action conflicts with the current state.',
} as const

export type ActionOutcome =
  | { notFound: true }
  | { conflict: { message: string; code: string }; action: ActionOutput }
  | { failed: { message: string; code: ActionFailure }; action: ActionOutput }
  | { action: ActionOutput }

/**
 * Accepts or rejects one action an assistant message proposed: the only path from the assistant
 * to the account's work. The message is locked until the end, so an action is answered once.
 * Accepting parses the stored input again and applies it through the route's own service, with
 * the caller's ownership checked again, in the same transaction as the new status; a failure is
 * stored (`failed`) with its reason, and whatever the service wrote is rolled back with its
 * savepoint. What cannot be rolled back (a deleted project's files) runs after the commit.
 */
export async function answerAction(
  decision: ActionDecision,
  target: { conversationId: number; messageId: number; index: number },
  user: User,
): Promise<ActionOutcome> {
  let afterCommit: (() => Promise<void>) | undefined
  const outcome = await db.transaction(async (trx): Promise<ActionOutcome> => {
    const message = await AssistantMessage.query({ client: trx })
      .where('id', target.messageId)
      .where('conversationId', target.conversationId)
      .where('role', AssistantRole.Assistant)
      .forUpdate()
      .first()
    const action = message?.actions?.[target.index]
    if (!message?.actions || !action) return { notFound: true }
    if (action.status !== ActionStatus.Pending) {
      return { conflict: NOT_PENDING, action: serializeAction(action, target.index) }
    }

    const applied =
      decision === ActionDecision.Reject
        ? { next: { ...action, status: ActionStatus.Rejected }, problem: null }
        : await apply(action, user, trx)
    const { next, problem } = applied
    const changed = 'changed' in applied
    afterCommit = 'afterCommit' in applied ? applied.afterCommit : undefined
    message.actions = message.actions.map((item, index) => (index === target.index ? next : item))
    await message.save()
    const output = serializeAction(next, target.index)
    if (changed) return { conflict: CHANGED, action: output }
    if (problem && next.failure) {
      return { failed: { message: problem, code: next.failure }, action: output }
    }
    return { action: output }
  })
  // The rows are gone and the action is stored: a file left behind must not turn that into a failure.
  await afterCommit?.().catch((error) =>
    logger.error({ err: error }, 'assistant action cleanup failed'),
  )
  return outcome
}

async function apply(
  action: StoredAction,
  user: User,
  trx: TransactionClientContract,
): Promise<{
  next: StoredAction
  problem: string | null
  afterCommit?: () => Promise<void>
  changed?: true
}> {
  const failed = (failure: ActionFailure, problem: string = FAILURE_MESSAGES[failure]) => ({
    next: { ...action, status: ActionStatus.Failed, failure },
    problem,
  })
  const known = findAction(action.name)
  // The registry changed since the proposal: nothing does this any more.
  if (!known || known.kind !== AssistantToolKind.Write) return failed(ActionFailure.NotFound)
  // Its flag was turned off since: as if nothing did this any more.
  if (!(await isAvailable(known, user))) return failed(ActionFailure.NotFound)
  const parsed = known.input.safeParse(action.input)
  if (!parsed.success) {
    return failed(
      ActionFailure.Invalid,
      parsed.error.issues.map((issue) => issue.message).join('; '),
    )
  }
  // The target as it is now: gone, unable to take the action, or no longer what the card said.
  const subject = await known.subject(parsed.data, user)
  if (subject === TARGET_NOT_FOUND) return failed(ActionFailure.NotFound)
  const refused = await known.currentProblem(parsed.data, user)
  if (refused) return failed(ActionFailure.Conflict, refused)
  const now = await currentState(known, parsed.data, user)
  const said = { impact: action.impact ?? null, before: action.before ?? null }
  if (!isDeepStrictEqual({ impact: now.impact, before: now.before }, said)) {
    // Still pending, with what it would do now: the owner decides again on a true card.
    return { next: { ...action, ...now, subject }, problem: null, changed: true }
  }
  const applied = await known.apply(parsed.data, user, trx)
  if ('failure' in applied) {
    return failed(applied.failure, 'message' in applied ? applied.message : undefined)
  }
  if ('deleted' in applied) {
    return {
      next: { ...action, status: ActionStatus.Accepted, result: null },
      problem: null,
      afterCommit: applied.afterCommit,
    }
  }
  return { next: { ...action, status: ActionStatus.Accepted, result: applied }, problem: null }
}

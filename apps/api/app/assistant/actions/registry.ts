import { type AssistantTool, AssistantToolKind } from '@coreloom-uml/llm'
import {
  type AssistantAction,
  NOT_FOUND_SENTENCE,
  TARGET_NOT_FOUND,
} from '#app/assistant/actions/action'
import { AGENT_CONFIG_ACTIONS } from '#app/assistant/actions/agent-config-actions'
import { ARCHITECTURE_ACTIONS } from '#app/assistant/actions/architecture-actions'
import { PROJECT_ACTIONS } from '#app/assistant/actions/project-actions'
import { ActionStatus, type StoredAction } from '#app/assistant/constants/assistant'
import type User from '#app/users/models/user'

/** Every action the assistant can call, read or write (see `action.ts`). */
export const ASSISTANT_ACTIONS: readonly AssistantAction[] = [
  ...PROJECT_ACTIONS,
  ...ARCHITECTURE_ACTIONS,
  ...AGENT_CONFIG_ACTIONS,
]

export function findAction(name: string): AssistantAction | undefined {
  return ASSISTANT_ACTIONS.find((action) => action.name === name)
}

/**
 * What a card says of the state an action would change, read now: what a deletion takes with it,
 * the state it replaces, and whether it can be undone. Read when the action is proposed and again
 * when it is accepted, so an action never does more than its card said.
 */
export async function currentState(
  action: Extract<AssistantAction, { kind: typeof AssistantToolKind.Write }>,
  input: unknown,
  user: User,
): Promise<Pick<StoredAction, 'impact' | 'before' | 'destructive'>> {
  // Only what goes with it: a count of zero says nothing.
  const counts = Object.entries(await action.impact(input, user)).filter(([, count]) => count > 0)
  const before = await action.before(input, user)
  return {
    impact: counts.length > 0 ? Object.fromEntries(counts) : null,
    before,
    destructive:
      typeof action.destructive === 'function'
        ? action.destructive(before)
        : action.destructive === true,
  }
}

/**
 * The actions as the loop's tools, bound to `user`. A write records its proposal in `proposals`
 * (with the target's current name), or tells the model why not: its target does not exist, or
 * its input can never be applied.
 */
export function actionTools(user: User, proposals: StoredAction[]): AssistantTool[] {
  return ASSISTANT_ACTIONS.map((action): AssistantTool => {
    const { name, description, input: inputSchema } = action
    if (action.kind === AssistantToolKind.Read) {
      return {
        name,
        description,
        inputSchema,
        kind: action.kind,
        run: (input) => action.read(input, user),
      }
    }
    return {
      name,
      description,
      inputSchema,
      kind: action.kind,
      run: async (input) => {
        const problem = action.problem?.(input)
        if (problem) return problem
        const subject = await action.subject(input, user)
        if (subject === TARGET_NOT_FOUND) return NOT_FOUND_SENTENCE
        const current = await action.currentProblem(input, user)
        if (current) return current
        proposals.push({
          name,
          input: action.input.parse(input) as Record<string, unknown>,
          subject,
          status: ActionStatus.Pending,
          result: null,
          failure: null,
          ...(await currentState(action, input, user)),
        })
        return null
      },
    }
  })
}

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
 * The actions as the loop's tools, bound to `user`. A write records its proposal in `proposals`
 * (with the target's current name), or tells the model its target does not exist.
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
        const subject = await action.subject(input, user)
        if (subject === TARGET_NOT_FOUND) return NOT_FOUND_SENTENCE
        proposals.push({
          name,
          input: action.input.parse(input) as Record<string, unknown>,
          subject,
          destructive: action.destructive === true,
          status: ActionStatus.Pending,
          result: null,
          failure: null,
        })
        return null
      },
    }
  })
}

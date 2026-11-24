import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { repositoryAvailable } from '#app/assistant/actions/repository-actions'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import { SHELL } from '#app/assistant/services/repository-commands'
import { RepositorySession } from '#app/assistant/services/repository-session'
import { sandboxCommandInput } from '#app/assistant/validators/assistant-input'
import type { SandboxCommandOutput } from '#app/assistant/validators/assistant-output'

const NO_SANDBOX = {
  error: {
    message:
      'This conversation has no repository sandbox yet: ask the assistant about a project’s repository first.',
    code: 'no_sandbox',
  },
} as const
const BUSY = {
  error: {
    message: 'The assistant is using the sandbox: try again once it has answered.',
    code: 'busy',
  },
} as const
const UNAVAILABLE = {
  error: { message: 'The repository sandbox is unavailable right now.', code: 'unavailable' },
} as const

/**
 * `POST /assistant/conversations/:conversationId/sandbox/commands`: the owner's own terminal in
 * the conversation's repository sandbox. One bash command, run the way a command of the model is
 * (`SHELL`: from the clone, killed after `shellSeconds`, its output capped) in the sandbox as the
 * assistant left it: never a new clone, so never a token, and cut off the network again before
 * the command runs. One command or one message at a time per conversation (the session's lock).
 * The command and what it printed are answered to the owner only: never stored or logged, counts
 * only. Behind the flags of the repository tools. Session only.
 */
export default class AssistantSandboxController {
  async run({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user)) || !(await repositoryAvailable(user))) {
      return response.notFound(ASSISTANT_NOT_FOUND)
    }
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)
    const { command } = await request.validateUsing(sandboxCommandInput)

    const started = performance.now()
    const session = new RepositorySession(user, conversation.id)
    try {
      const opened = await session.resume()
      if (opened === 'none') return response.notFound(NO_SANDBOX)
      if (opened === 'busy') return response.conflict(BUSY)
      if (opened === 'gone') return response.serviceUnavailable(UNAVAILABLE)
      const ran = await opened.sandbox.run(
        SHELL,
        { REPO_ROOT: REPOSITORY_SANDBOX.root, SHELL_COMMAND: command },
        (REPOSITORY_SANDBOX.shellSeconds + 5) * 1000,
      )
      if (ran.exitCode === REPOSITORY_SANDBOX.goneExitCode) {
        return response.serviceUnavailable(UNAVAILABLE)
      }
      logger.info(
        {
          conversationId: conversation.id,
          exitCode: ran.exitCode,
          durationMs: Math.round(performance.now() - started),
        },
        'assistant sandbox command',
      )
      return response.ok({
        exitCode: ran.exitCode,
        output: ran.output.slice(0, REPOSITORY_SANDBOX.outputMaxBytes),
      } satisfies SandboxCommandOutput)
    } finally {
      await session.close()
    }
  }
}

import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { repositoryAvailable } from '#app/assistant/actions/repository-actions'
import { REPOSITORY_SANDBOX, TERMINAL_CWD_MAX_LENGTH } from '#app/assistant/constants/repository'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import {
  CONVERSATION_NOT_FOUND,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import {
  STOP_TERMINAL,
  TERMINAL,
  terminalCwdFile,
} from '#app/assistant/services/repository-commands'
import type { OpenRepositorySandbox } from '#app/assistant/services/repository-sandbox'
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
 * (`TERMINAL`: `SHELL`'s limits, from the folder the command before it ended in) in the sandbox
 * as the assistant left it: never a new clone, so never a token, and cut off the network again
 * before the command runs. One command or one message at a time per conversation (the session's
 * lock). The owner going away (Ctrl+C) stops the command in the sandbox. The command and what it
 * printed are answered to the owner only: never stored or logged, counts only. Behind the flags
 * of the repository tools. Session only.
 */
export default class AssistantSandboxController {
  async run({ params, request, auth, response }: HttpContext) {
    // Listened to from the start, on the response's own close: the request's fires once its body
    // was read.
    const gone = new AbortController()
    const raw = response.response
    raw.once('close', () => {
      if (!raw.writableFinished) gone.abort()
    })
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
      const { sandbox } = opened
      const envs = { REPO_ROOT: REPOSITORY_SANDBOX.root }
      const stop = () => void sandbox.run(STOP_TERMINAL, envs)
      gone.signal.addEventListener('abort', stop, { once: true })
      const ran = gone.signal.aborted
        ? { exitCode: 130, output: '' }
        : await sandbox.run(
            TERMINAL,
            { ...envs, SHELL_COMMAND: command },
            (REPOSITORY_SANDBOX.shellSeconds + 5) * 1000,
          )
      gone.signal.removeEventListener('abort', stop)
      if (ran.exitCode === REPOSITORY_SANDBOX.goneExitCode) {
        return response.serviceUnavailable(UNAVAILABLE)
      }
      logger.info(
        {
          conversationId: conversation.id,
          exitCode: ran.exitCode,
          stopped: gone.signal.aborted,
          durationMs: Math.round(performance.now() - started),
        },
        'assistant sandbox command',
      )
      return response.ok({
        exitCode: ran.exitCode,
        output: ran.output.slice(0, REPOSITORY_SANDBOX.outputMaxBytes),
        cwd: await cwdOf(sandbox),
      } satisfies SandboxCommandOutput)
    } finally {
      await session.close()
    }
  }
}

/** The folder the terminal is in, as the sandbox says it: one bounded line of plain characters. */
async function cwdOf(sandbox: OpenRepositorySandbox): Promise<string | null> {
  const bytes = await sandbox.readFile(terminalCwdFile(REPOSITORY_SANDBOX.root))
  if (!bytes) return null
  const line = new TextDecoder().decode(bytes.subarray(0, TERMINAL_CWD_MAX_LENGTH * 4)).trim()
  return line.replaceAll(/[^\x20-\x7e]/g, '?').slice(0, TERMINAL_CWD_MAX_LENGTH) || null
}

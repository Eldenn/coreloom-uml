import { PassThrough } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { repositoryAvailable } from '#app/assistant/actions/repository-actions'
import {
  REPOSITORY_SANDBOX,
  TERMINAL_CWD_MAX_LENGTH,
  TERMINAL_LIMITS,
} from '#app/assistant/constants/repository'
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
import { type OpenRepository, RepositorySession } from '#app/assistant/services/repository-session'
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

/** One command of the terminal, run: null when the sandbox never answered. */
type Ran = SandboxCommandOutput | null

/**
 * `POST /assistant/conversations/:conversationId/sandbox/commands`: the owner's own terminal in
 * the conversation's repository sandbox. One bash command, run the way a command of the model is
 * (`TERMINAL`: its own limits, from the folder the command before it ended in) in the sandbox
 * as the assistant left it: never a new clone, so never a token, and cut off the network again
 * before the command runs. One command or one message at a time per conversation (the session's
 * lock). The owner going away (Ctrl+C) stops the command in the sandbox. A request that accepts
 * `text/event-stream` (the web) is answered what the command prints as it prints it, then its
 * exit code and folder; any other, the whole as JSON. The command and what it printed are
 * answered to the owner only: never stored or logged, counts only. Behind the flags of the
 * repository tools. Session only.
 */
export default class AssistantSandboxController {
  async run({ params, request, auth, response }: HttpContext) {
    const streamed =
      request.accepts(['application/json', 'text/event-stream']) === 'text/event-stream'
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

    const session = new RepositorySession(user, conversation.id)
    // Held and awake past the command's own limit, should the API die before it frees them.
    const opened = await session.resume(TERMINAL_LIMITS.seconds + 30).catch(async (error) => {
      await session.close()
      throw error
    })
    if (typeof opened === 'string') {
      await session.close()
      if (opened === 'none') return response.notFound(NO_SANDBOX)
      if (opened === 'busy') return response.conflict(BUSY)
      return response.serviceUnavailable(UNAVAILABLE)
    }
    const work = (onOutput?: (text: string) => void) =>
      runCommand(session, opened, command, gone.signal, {
        conversationId: conversation.id,
        streamed,
        onOutput,
      })
    if (!streamed) {
      const ran = await work()
      return ran ? response.ok(ran) : response.serviceUnavailable(UNAVAILABLE)
    }
    response.header('Content-Type', 'text/event-stream')
    response.header('Cache-Control', 'no-cache, no-transform')
    // Tells nginx-style proxies not to buffer the stream.
    response.header('X-Accel-Buffering', 'no')
    const out = new PassThrough()
    // The owner gone, the response destroys it: nothing is left to tell anyone.
    out.on('error', () => {})
    void streamCommand(out, work, conversation.id)
    response.stream(out)
    // Answered by the stream: kept out of the JSON response type Tuyau reads.
    return undefined as never
  }
}

/**
 * Runs the command and leaves the sandbox to rest, whatever happens. Stops it in the sandbox
 * when `gone` aborts.
 */
async function runCommand(
  session: RepositorySession,
  { sandbox }: OpenRepository,
  command: string,
  gone: AbortSignal,
  options: { conversationId: number; streamed: boolean; onOutput?: (text: string) => void },
): Promise<Ran> {
  const started = performance.now()
  try {
    const envs = { REPO_ROOT: REPOSITORY_SANDBOX.root }
    const stop = () => void sandbox.run(STOP_TERMINAL, envs)
    gone.addEventListener('abort', stop, { once: true })
    const ran = gone.aborted
      ? { exitCode: 130, output: '' }
      : await sandbox.run(
          TERMINAL,
          { ...envs, SHELL_COMMAND: command },
          (TERMINAL_LIMITS.seconds + 5) * 1000,
          options.onOutput,
        )
    gone.removeEventListener('abort', stop)
    if (ran.exitCode === REPOSITORY_SANDBOX.goneExitCode) return null
    logger.info(
      {
        conversationId: options.conversationId,
        exitCode: ran.exitCode,
        stopped: gone.aborted,
        streamed: options.streamed,
        durationMs: Math.round(performance.now() - started),
      },
      'assistant sandbox command',
    )
    return {
      exitCode: ran.exitCode,
      output: ran.output.slice(0, TERMINAL_LIMITS.outputMaxBytes),
      cwd: await cwdOf(sandbox),
    }
  } finally {
    await session.close()
  }
}

/**
 * The command as an event stream: `{ output }` frames a few times a second while it prints, a
 * comment while it is silent, then one `{ exitCode, cwd }`, or one `{ error }` when the sandbox
 * stopped answering. The pieces sent add up to the output the JSON answer would hold.
 */
async function streamCommand(
  out: PassThrough,
  work: (onOutput: (text: string) => void) => Promise<Ran>,
  conversationId: number,
) {
  const send = (frame: string) => {
    if (!out.destroyed) out.write(frame)
  }
  const data = (value: unknown) => send(`data: ${JSON.stringify(value)}\n\n`)
  let pending = ''
  let sent = 0
  let wroteAt = Date.now()
  const flush = () => {
    if (pending) data({ output: pending })
    else if (Date.now() - wroteAt < TERMINAL_LIMITS.heartbeatMs) return
    else send(': alive\n\n')
    pending = ''
    wroteAt = Date.now()
  }
  const timer = setInterval(flush, REPOSITORY_SANDBOX.liveOutputMs)
  try {
    const ran = await work((text) => {
      const kept = text.slice(0, TERMINAL_LIMITS.outputMaxBytes - sent)
      sent += kept.length
      pending += kept
    })
    // What the sandbox answered at the end and never sent as it came, if anything.
    if (ran) pending += ran.output.slice(sent)
    if (pending) data({ output: pending })
    data(ran ? { exitCode: ran.exitCode, cwd: ran.cwd } : UNAVAILABLE)
  } catch (error) {
    // What the exception handler logs for the JSON answer: the stream has already begun.
    logger.error({ conversationId, err: error }, 'assistant sandbox command stream failed')
    data(UNAVAILABLE)
  } finally {
    clearInterval(timer)
    out.end()
  }
}

/** The folder the terminal is in, as the sandbox says it: one bounded line of plain characters. */
async function cwdOf(sandbox: OpenRepositorySandbox): Promise<string | null> {
  const bytes = await sandbox.readFile(terminalCwdFile(REPOSITORY_SANDBOX.root))
  if (!bytes) return null
  const line = new TextDecoder().decode(bytes.subarray(0, TERMINAL_CWD_MAX_LENGTH * 4)).trim()
  return line.replaceAll(/[^\x20-\x7e]/g, '?').slice(0, TERMINAL_CWD_MAX_LENGTH) || null
}

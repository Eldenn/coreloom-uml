import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { LlmCallError, LlmFailureReason } from '@coreloom-uml/llm'
import {
  CLAUDE_LOGIN_TIMEOUT_MS,
  CLAUDE_LOGIN_URL_TIMEOUT_MS,
  CLAUDE_STATUS_TTL_MS,
} from '#app/llm-connections/constants/llm-connections'
import ClaudeCodeCli, { type ClaudeLogin } from '#app/llm-connections/services/claude-code-cli'
import {
  deleteClaudeState,
  hasClaudeState,
  makeClaudeFolder,
  readClaudeFolder,
  removeClaudeFolder,
  saveClaudeState,
  withClaudeFolder,
  withClaudeLock,
} from '#app/llm-connections/services/claude-code-state'
import type User from '#app/users/models/user'

/**
 * A Claude subscription is signed in by the unmodified `claude` binary, and its state is kept in
 * the database (`claude-code-state.ts`): this code starts the binary's sign-in in a short-lived
 * folder, passes the pasted code to it, saves the folder's files once it is signed in, asks it
 * whether it still is, and signs it out. It never reads, logs or returns the code or what the
 * files hold.
 */

type Person = Pick<User, 'id'>

const statuses = new Map<number, { connected: boolean; at: number }>()
// ponytail: sign-ins live in this API process; route a user to one instance (or move them to a
// shared runner) before running several API replicas.
const logins = new Map<
  number,
  { login: ClaudeLogin; timer: NodeJS.Timeout; dir: string; submitting: boolean }
>()

/**
 * Stops the user's sign-in and removes its folder; with `only`, only if it is still current. The
 * sign-in leaves `logins` at once (no await before), and the returned promise settles once the
 * binary has exited and then its folder is gone: removed while the binary still runs, the folder
 * could get a file back. It never rejects: a binary that cannot be stopped or a folder that cannot
 * be removed is logged (such a folder is purged at the next start by `importClaudeFolders`).
 */
function stopLogin(user: Person, only?: ClaudeLogin): Promise<void> {
  const running = logins.get(user.id)
  if (!running || (only && running.login !== only)) return Promise.resolve()
  clearTimeout(running.timer)
  logins.delete(user.id)
  return endLogin(user, running.login, running.dir)
}

async function endLogin(user: Person, login: ClaudeLogin, dir: string): Promise<void> {
  const failed = (step: string) => (error: unknown) => {
    const reason =
      error instanceof Error ? ((error as NodeJS.ErrnoException).code ?? error.name) : 'unknown'
    logger.warn({ userId: user.id, error: reason }, `claude sign-in ${step}`)
  }
  await login.kill().catch(failed('not stopped'))
  await removeClaudeFolder(dir).catch(failed('folder not removed'))
}

/**
 * Whether the account holds a signed-in subscription; asked again after a short while. An account
 * without a saved state answers without starting the binary; one whose binary is busy with a
 * launch is connected, since only a saved state can be launched.
 */
export async function claudeConnected(user: Person): Promise<boolean> {
  const cached = statuses.get(user.id)
  if (cached && Date.now() - cached.at < CLAUDE_STATUS_TTL_MS) return cached.connected
  if (!(await hasClaudeState(user))) return false
  const cli = await app.container.make(ClaudeCodeCli)
  let connected: boolean
  try {
    connected = await withClaudeFolder(user, (dir) => cli.status(dir), { waitMs: 0 })
  } catch (error) {
    if (!(error instanceof LlmCallError)) throw error
    connected = error.reason === LlmFailureReason.Timeout
  }
  statuses.set(user.id, { connected, at: Date.now() })
  return connected
}

/**
 * Starts the binary's sign-in in a new private folder and returns the page it prints. One per
 * account: a new one stops the previous one, and one left waiting stops after `timeoutMs`. A
 * binary that prints no page within `urlTimeoutMs` is stopped, and the call fails with a
 * `timeout` `LlmCallError`.
 */
export async function startClaudeLogin(
  user: Person,
  options: { timeoutMs?: number; urlTimeoutMs?: number } = {},
): Promise<string> {
  const cli = await app.container.make(ClaudeCodeCli)
  const dir = await makeClaudeFolder()
  // No await between stopping the previous sign-in and recording this one: two requests at once
  // cannot both pass the stop and leave a process running.
  const previous = stopLogin(user)
  let login: ClaudeLogin
  try {
    login = cli.login(dir)
  } catch (error) {
    await removeClaudeFolder(dir)
    await previous
    throw error
  }
  // Nobody waits for a sign-in left open: its stop runs on its own, still in order.
  const timer = setTimeout(
    () => void stopLogin(user, login),
    options.timeoutMs ?? CLAUDE_LOGIN_TIMEOUT_MS,
  )
  timer.unref()
  logins.set(user.id, { login, timer, dir, submitting: false })
  let urlTimer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_resolve, reject) => {
    urlTimer = setTimeout(
      () => reject(new LlmCallError(LlmFailureReason.Timeout)),
      options.urlTimeoutMs ?? CLAUDE_LOGIN_URL_TIMEOUT_MS,
    )
  })
  try {
    return await Promise.race([login.url, late])
  } catch (error) {
    await stopLogin(user, login)
    throw error
  } finally {
    clearTimeout(urlTimer)
    await previous
  }
}

/**
 * Hands the pasted code to the running sign-in; `null` when none is running or a code is already
 * being handed to it. Once the binary says it is signed in, its folder's files replace the
 * account's saved state; the sign-in and its folder go whatever happens.
 */
export async function submitClaudeCode(user: Person, code: string): Promise<boolean | null> {
  const running = logins.get(user.id)
  if (!running || running.submitting) return null
  running.submitting = true
  try {
    let connected = await running.login.submit(code)
    if (connected) {
      const files = await readClaudeFolder(running.dir)
      if (files === null) connected = false
      else await withClaudeLock(user, () => saveClaudeState(user, files))
    }
    statuses.set(user.id, { connected, at: Date.now() })
    return connected
  } finally {
    await stopLogin(user, running.login)
  }
}

/**
 * Drops the account's saved state, without asking the binary. A launch running meanwhile never
 * brings it back: it writes its files back only over the row it read.
 */
export async function forgetClaude(user: Person): Promise<void> {
  await stopLogin(user)
  statuses.delete(user.id)
  await deleteClaudeState(user)
}

/**
 * Signs the binary out for this account (best effort) and drops its saved state in the same
 * launch slot, then drops it again in case the slot stayed busy.
 */
export async function disconnectClaude(user: Person): Promise<void> {
  await stopLogin(user)
  if (await hasClaudeState(user)) {
    const cli = await app.container.make(ClaudeCodeCli)
    await withClaudeFolder(user, (dir) => cli.logout(dir), { drop: true }).catch((error) => {
      if (!(error instanceof LlmCallError)) throw error
    })
  }
  await forgetClaude(user)
}

import app from '@adonisjs/core/services/app'
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
const logins = new Map<number, { login: ClaudeLogin; timer: NodeJS.Timeout; dir: string }>()

/** Stops the user's sign-in and removes its folder; with `only`, only if it is still current. */
function stopLogin(user: Person, only?: ClaudeLogin): void {
  const running = logins.get(user.id)
  if (!running || (only && running.login !== only)) return
  clearTimeout(running.timer)
  running.login.kill()
  logins.delete(user.id)
  void removeClaudeFolder(running.dir).catch(() => {})
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
  stopLogin(user)
  const login = cli.login(dir)
  const timer = setTimeout(
    () => stopLogin(user, login),
    options.timeoutMs ?? CLAUDE_LOGIN_TIMEOUT_MS,
  )
  timer.unref()
  logins.set(user.id, { login, timer, dir })
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
    stopLogin(user, login)
    throw error
  } finally {
    clearTimeout(urlTimer)
  }
}

/**
 * Hands the pasted code to the running sign-in; `null` when none is running. Once the binary says
 * it is signed in, its folder's files replace the account's saved state, and the folder goes.
 */
export async function submitClaudeCode(user: Person, code: string): Promise<boolean | null> {
  const running = logins.get(user.id)
  if (!running) return null
  let connected = await running.login.submit(code)
  if (connected) {
    const files = await readClaudeFolder(running.dir)
    if (files === null) connected = false
    else await withClaudeLock(user, () => saveClaudeState(user, files))
  }
  stopLogin(user, running.login)
  statuses.set(user.id, { connected, at: Date.now() })
  return connected
}

/** Drops the account's saved state, without asking the binary. */
export async function forgetClaude(user: Person): Promise<void> {
  stopLogin(user)
  statuses.delete(user.id)
  await deleteClaudeState(user)
}

/** Signs the binary out for this account (best effort), then drops its saved state. */
export async function disconnectClaude(user: Person): Promise<void> {
  stopLogin(user)
  if (await hasClaudeState(user)) {
    const cli = await app.container.make(ClaudeCodeCli)
    await withClaudeFolder(user, (dir) => cli.logout(dir), { keep: false }).catch((error) => {
      if (!(error instanceof LlmCallError)) throw error
    })
  }
  await forgetClaude(user)
}

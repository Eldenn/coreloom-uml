import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { LlmCallError, LlmFailureReason } from '@coreloom-uml/llm'
import {
  CLAUDE_LOGIN_TIMEOUT_MS,
  CLAUDE_LOGIN_URL_TIMEOUT_MS,
  CLAUDE_STATUS_TTL_MS,
} from '#app/llm-connections/constants/llm-connections'
import ClaudeCodeCli, { type ClaudeLogin } from '#app/llm-connections/services/claude-code-cli'
import type User from '#app/users/models/user'
import llmConfig from '#config/llm'

/**
 * A Claude subscription is held by the `claude` binary alone, in one folder per account: this code
 * starts its sign-in, passes the pasted code to it, asks whether it is signed in, and signs it out.
 * It never reads, stores, logs or returns the code or the credentials.
 */

type Person = Pick<User, 'id'>

const statuses = new Map<number, { connected: boolean; at: number }>()
// ponytail: sign-ins live in this API process; route a user to one instance (or move them to a
// shared runner) before running several API replicas.
const logins = new Map<number, { login: ClaudeLogin; timer: NodeJS.Timeout }>()

function folder(user: Person): string {
  return join(llmConfig.claudeCodeHome, String(user.id))
}

/** Whether the account's folder exists: without it, the binary was never signed in for it. */
async function hasFolder(user: Person): Promise<boolean> {
  return stat(folder(user)).then(
    () => true,
    () => false,
  )
}

/** The account's own `CLAUDE_CONFIG_DIR`, created private (0700) on first use. */
export async function claudeConfigDir(user: Person): Promise<string> {
  const dir = folder(user)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  return dir
}

/** Stops the user's sign-in; with `only`, only if that sign-in is still the current one. */
function stopLogin(user: Person, only?: ClaudeLogin): void {
  const running = logins.get(user.id)
  if (!running || (only && running.login !== only)) return
  clearTimeout(running.timer)
  running.login.kill()
  logins.delete(user.id)
}

/** Whether the binary is signed in for this account; asked again after a short while. */
export async function claudeConnected(user: Person): Promise<boolean> {
  const cached = statuses.get(user.id)
  if (cached && Date.now() - cached.at < CLAUDE_STATUS_TTL_MS) return cached.connected
  // Never signed in here: answer without creating the folder or starting the binary.
  if (!(await hasFolder(user))) return false
  const cli = await app.container.make(ClaudeCodeCli)
  const connected = await cli.status(await claudeConfigDir(user))
  statuses.set(user.id, { connected, at: Date.now() })
  return connected
}

/**
 * Starts the binary's sign-in and returns the page it prints. One per account: a new one stops
 * the previous one, and one left waiting stops after `timeoutMs`. A binary that prints no page
 * within `urlTimeoutMs` is stopped, and the call fails with a `timeout` `LlmCallError`.
 */
export async function startClaudeLogin(
  user: Person,
  options: { timeoutMs?: number; urlTimeoutMs?: number } = {},
): Promise<string> {
  const cli = await app.container.make(ClaudeCodeCli)
  const dir = await claudeConfigDir(user)
  // No await between stopping the previous sign-in and recording this one: two requests at once
  // cannot both pass the stop and leave a process running.
  stopLogin(user)
  const login = cli.login(dir)
  const timer = setTimeout(
    () => stopLogin(user, login),
    options.timeoutMs ?? CLAUDE_LOGIN_TIMEOUT_MS,
  )
  timer.unref()
  logins.set(user.id, { login, timer })
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

/** Hands the pasted code to the running sign-in; `null` when none is running. */
export async function submitClaudeCode(user: Person, code: string): Promise<boolean | null> {
  const running = logins.get(user.id)
  if (!running) return null
  const connected = await running.login.submit(code)
  stopLogin(user)
  statuses.set(user.id, { connected, at: Date.now() })
  return connected
}

/** Removes the account's folder, credentials included, without asking the binary. */
export async function forgetClaude(user: Person): Promise<void> {
  stopLogin(user)
  statuses.delete(user.id)
  await rm(folder(user), { recursive: true, force: true })
}

/** Signs the binary out for this account, then removes its folder. */
export async function disconnectClaude(user: Person): Promise<void> {
  stopLogin(user)
  if (await hasFolder(user)) {
    const cli = await app.container.make(ClaudeCodeCli)
    await cli.logout(folder(user))
  }
  await forgetClaude(user)
}

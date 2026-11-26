import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import redis from '@adonisjs/redis/services/main'
import { LlmCallError, LlmFailureReason } from '@coreloom-uml/llm'
import {
  CLAUDE_CREDENTIALS_FILE,
  CLAUDE_LOCK_RETRY_MS,
  CLAUDE_LOCK_TTL_MS,
  CLAUDE_LOCK_WAIT_MS,
  CLAUDE_STATE_FILE_MAX_BYTES,
  CLAUDE_STATE_FILES,
} from '#app/llm-connections/constants/llm-connections'
import ClaudeCodeState, {
  type ClaudeStateFiles,
} from '#app/llm-connections/models/claude-code-state'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'

/**
 * A Claude subscription lives in the database (`claude_code_states`): the files the `claude`
 * binary keeps in its configuration folder, sealed by `llmKeys`. Nothing of it stays on a disk.
 * Each launch of the binary borrows a short-lived private folder holding them (`withClaudeFolder`)
 * and the files are written back when it ends, since the binary refreshes its own tokens. This
 * code moves the files whole: it never parses, logs or returns what they hold.
 */

type Owner = { id: number }

/** Releases the lock only while it is still ours (it may have ended and been taken again). */
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`

function lockKey(owner: Owner): string {
  return `claude-code:running:${owner.id}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Takes the account's one launch slot, waiting up to `waitMs` for the launch before it; the
 * token releases it, `null` when it stayed busy that long.
 */
async function acquire(owner: Owner, waitMs: number): Promise<string | null> {
  const token = randomUUID()
  const until = Date.now() + waitMs
  for (;;) {
    if ((await redis.set(lockKey(owner), token, 'PX', CLAUDE_LOCK_TTL_MS, 'NX')) === 'OK') {
      return token
    }
    if (Date.now() >= until) return null
    await sleep(CLAUDE_LOCK_RETRY_MS)
  }
}

async function release(owner: Owner, token: string): Promise<void> {
  await redis.eval(RELEASE, 1, lockKey(owner), token)
}

/** Where the short-lived folders are made: private (0700), created on first use. */
async function folderRoot(): Promise<string> {
  await mkdir(llmConfig.claudeCodeHome, { recursive: true, mode: 0o700 })
  return llmConfig.claudeCodeHome
}

/** A new private folder for one launch or one sign-in; the caller removes it. */
export async function makeClaudeFolder(): Promise<string> {
  return mkdtemp(join(await folderRoot(), 'run-'))
}

export async function removeClaudeFolder(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

/** The kept files of a folder, each within its size; `null` without the binary's credentials. */
export async function readClaudeFolder(dir: string): Promise<ClaudeStateFiles | null> {
  const files: ClaudeStateFiles = {}
  for (const name of CLAUDE_STATE_FILES) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile() || info.size > CLAUDE_STATE_FILE_MAX_BYTES) continue
    files[name] = await readFile(path, 'utf8')
  }
  return files[CLAUDE_CREDENTIALS_FILE] === undefined ? null : files
}

async function writeClaudeFolder(dir: string, files: ClaudeStateFiles): Promise<void> {
  for (const name of CLAUDE_STATE_FILES) {
    const content = files[name]
    if (content !== undefined) await writeFile(join(dir, name), content, { mode: 0o600 })
  }
}

/** The account's saved state, or `null` when it has none or it cannot be read. */
export async function claudeState(owner: Owner): Promise<ClaudeStateFiles | null> {
  const row = await ClaudeCodeState.findBy('userId', owner.id)
  return row?.files ?? null
}

export async function hasClaudeState(owner: Owner): Promise<boolean> {
  return (await ClaudeCodeState.query().where('user_id', owner.id).first()) !== null
}

/** Stores (or replaces) the account's state. */
export async function saveClaudeState(owner: Owner, files: ClaudeStateFiles): Promise<void> {
  await ClaudeCodeState.updateOrCreate({ userId: owner.id }, { files })
}

export async function deleteClaudeState(owner: Owner): Promise<void> {
  await ClaudeCodeState.query().where('user_id', owner.id).delete()
}

function sameFiles(a: ClaudeStateFiles, b: ClaudeStateFiles): boolean {
  const names = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...names].every((name) => a[name] === b[name])
}

/**
 * Runs `use` holding the account's one launch slot, waiting up to `waitMs` for the launch before
 * it; fails with `timeout` when it stayed busy that long. Everything that reads or writes an
 * account's state while the binary may hold it goes through here.
 */
export async function withClaudeLock<T>(
  owner: Owner,
  use: () => Promise<T>,
  waitMs: number = CLAUDE_LOCK_WAIT_MS,
): Promise<T> {
  const token = await acquire(owner, waitMs)
  if (token === null) throw new LlmCallError(LlmFailureReason.Timeout)
  try {
    return await use()
  } finally {
    await release(owner, token)
  }
}

/**
 * Runs `use` with a private folder holding the account's saved state, one launch per account at
 * a time, then saves the files back when the binary changed them (a refreshed token) and removes
 * the folder. Fails with `subscription_expired` when the account has no readable state, and with
 * `timeout` when the launch before it held the account longer than `waitMs`. With `keep: false`
 * nothing is written back (signing out deletes the state instead).
 */
export async function withClaudeFolder<T>(
  owner: Owner,
  use: (dir: string) => Promise<T>,
  options: { waitMs?: number; keep?: boolean } = {},
): Promise<T> {
  return withClaudeLock(
    owner,
    async () => {
      const before = await claudeState(owner)
      if (before === null) throw new LlmCallError(LlmFailureReason.SubscriptionExpired)
      const dir = await makeClaudeFolder()
      try {
        await writeClaudeFolder(dir, before)
        const result = await use(dir)
        if (options.keep !== false) {
          const after = await readClaudeFolder(dir)
          // A launch that lost the credentials (signed out by Claude) keeps the state as it was:
          // the next call fails as an expired subscription and the owner connects again.
          if (after !== null && !sameFiles(before, after)) await saveClaudeState(owner, after)
        }
        return result
      } finally {
        await removeClaudeFolder(dir)
      }
    },
    options.waitMs,
  )
}

/** An account's folder from before the state moved to the database: `<CLAUDE_CODE_HOME>/<id>`. */
const ACCOUNT_FOLDER = /^\d+$/

/**
 * Moves the Claude subscriptions still held in account folders (`<CLAUDE_CODE_HOME>/<user id>`,
 * from before `claude_code_states`) into the database, then removes those folders. A folder whose
 * account already has a saved state, whose account is gone, or that holds no credentials is
 * removed without being read into a row. Short-lived folders (`run-*`) are left alone: a launch
 * may be using one. Run at every start (`node ace claude:import`); a second run finds nothing.
 */
export async function importClaudeFolders(): Promise<{ imported: number; removed: number }> {
  const root = llmConfig.claudeCodeHome
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  let imported = 0
  let removed = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !ACCOUNT_FOLDER.test(entry.name)) continue
    const owner = { id: Number(entry.name) }
    const dir = join(root, entry.name)
    const files = await readClaudeFolder(dir)
    const user = await User.find(owner.id)
    if (files !== null && user !== null) {
      const saved = await withClaudeLock(owner, async () => {
        if (await hasClaudeState(owner)) return false
        await saveClaudeState(owner, files)
        return true
      })
      if (saved) imported++
    }
    await removeClaudeFolder(dir)
    removed++
  }
  return { imported, removed }
}

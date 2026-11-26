import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import db from '@adonisjs/lucid/services/db'
import redis from '@adonisjs/redis/services/main'
import { LlmCallError, LlmFailureReason } from '@coreloom-uml/llm'
import {
  CLAUDE_CREDENTIALS_FILE,
  CLAUDE_LOCK_RETRY_MS,
  CLAUDE_LOCK_TTL_MS,
  CLAUDE_LOCK_WAIT_MS,
  CLAUDE_LOGIN_TIMEOUT_MS,
  CLAUDE_STATE_FILE_MAX_BYTES,
  CLAUDE_STATE_FILES,
  LlmSecretPurpose,
} from '#app/llm-connections/constants/llm-connections'
import ClaudeCodeState, {
  type ClaudeStateFiles,
} from '#app/llm-connections/models/claude-code-state'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'

/**
 * A Claude subscription lives in the database (`claude_code_states`): the files the `claude`
 * binary keeps in its configuration folder, sealed by `llmKeys`. Nothing of it stays on a disk.
 * Each launch of the binary borrows a short-lived private folder holding them (`withClaudeFolder`)
 * and the files are written back when it ends, since the binary refreshes its own tokens. This
 * code moves the files whole: it never logs or returns what they hold, and only checks that each
 * one still reads as JSON, so a file the binary was cut off writing is never kept.
 */

type Owner = { id: number }

/** Releases the lock only while it is still ours (it may have ended and been taken again). */
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`

/** The prefix of the short-lived folders, so the import never takes one for an account's. */
const RUN_PREFIX = 'run-'

function lockKey(owner: Owner): string {
  return `claude-code:running:${owner.id}`
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type LockOptions = { waitMs?: number; signal?: AbortSignal }

/**
 * Takes the account's one launch slot, waiting up to `waitMs` for the launch before it; the
 * token releases it, `null` when it stayed busy that long. A request that went away stops waiting.
 */
async function acquire(owner: Owner, waitMs: number, signal?: AbortSignal): Promise<string | null> {
  const token = randomUUID()
  const until = Date.now() + waitMs
  for (;;) {
    signal?.throwIfAborted()
    if ((await redis.set(lockKey(owner), token, 'PX', CLAUDE_LOCK_TTL_MS, 'NX')) === 'OK') {
      return token
    }
    if (Date.now() >= until) return null
    await sleep(CLAUDE_LOCK_RETRY_MS)
  }
}

/** Gives the slot back; a failure is left to the lock's own end, never to hide the result. */
async function release(owner: Owner, token: string): Promise<void> {
  await redis.eval(RELEASE, 1, lockKey(owner), token).catch(() => {})
}

/** Where the short-lived folders are made: private (0700), created on first use. */
async function folderRoot(): Promise<string> {
  await mkdir(llmConfig.claudeCodeHome, { recursive: true, mode: 0o700 })
  return llmConfig.claudeCodeHome
}

/** A new private folder for one launch or one sign-in; the caller removes it. */
export async function makeClaudeFolder(): Promise<string> {
  return mkdtemp(join(await folderRoot(), RUN_PREFIX))
}

export async function removeClaudeFolder(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}

function readsAsJson(content: string): boolean {
  try {
    JSON.parse(content)
    return true
  } catch {
    return false
  }
}

/** The kept files of a folder that are whole: within their size and still reading as JSON. */
async function readWholeFiles(dir: string): Promise<ClaudeStateFiles> {
  const files: ClaudeStateFiles = {}
  for (const name of CLAUDE_STATE_FILES) {
    const path = join(dir, name)
    const info = await stat(path).catch(() => null)
    if (!info?.isFile() || info.size > CLAUDE_STATE_FILE_MAX_BYTES) continue
    const content = await readFile(path, 'utf8')
    if (readsAsJson(content)) files[name] = content
  }
  return files
}

/** The kept files of a folder; `null` without whole credentials of the binary. */
export async function readClaudeFolder(dir: string): Promise<ClaudeStateFiles | null> {
  const files = await readWholeFiles(dir)
  return files[CLAUDE_CREDENTIALS_FILE] === undefined ? null : files
}

async function writeClaudeFolder(dir: string, files: ClaudeStateFiles): Promise<void> {
  for (const name of CLAUDE_STATE_FILES) {
    const content = files[name]
    if (content !== undefined) await writeFile(join(dir, name), content, { mode: 0o600 })
  }
}

/** A state sealed for its owner, as the `files` column stores it. */
function sealFiles(owner: Owner, files: ClaudeStateFiles): string {
  return sealLlmSecret(JSON.stringify(files), LlmSecretPurpose.ClaudeState, owner)
}

/**
 * A row's state, or `null` when it cannot be read (the keys changed, a row sealed for another
 * account) or does not hold files by name.
 */
function filesOf(row: ClaudeCodeState): ClaudeStateFiles | null {
  const plain = openLlmSecret(row.sealedFiles, LlmSecretPurpose.ClaudeState, { id: row.userId })
  if (plain === null) return null
  try {
    const files = JSON.parse(plain) as unknown
    if (!files || typeof files !== 'object' || Array.isArray(files)) return null
    const values = Object.values(files)
    return values.every((value) => typeof value === 'string') ? (files as ClaudeStateFiles) : null
  } catch {
    return null
  }
}

/** The account's saved state, or `null` when it has none or it cannot be read. */
export async function claudeState(owner: Owner): Promise<ClaudeStateFiles | null> {
  const row = await ClaudeCodeState.findBy('userId', owner.id)
  return row === null ? null : filesOf(row)
}

export async function hasClaudeState(owner: Owner): Promise<boolean> {
  return (await ClaudeCodeState.query().where('user_id', owner.id).first()) !== null
}

/** Stores (or replaces) the account's state: a sign-in, an import. */
export async function saveClaudeState(owner: Owner, files: ClaudeStateFiles): Promise<void> {
  const row = await ClaudeCodeState.findBy('userId', owner.id)
  if (row) {
    row.merge({ sealedFiles: sealFiles(owner, files), version: row.version + 1 })
    await row.save()
  } else {
    await ClaudeCodeState.create({
      userId: owner.id,
      sealedFiles: sealFiles(owner, files),
      version: 1,
    })
  }
}

/**
 * Writes a launch's files back over the version it read, and only over it: a row deleted since
 * (signed out, account gone) stays deleted, and a newer state is never overwritten. Whether it
 * was written.
 */
async function writeBack(owner: Owner, version: number, files: ClaudeStateFiles): Promise<boolean> {
  const updated = await db
    .from('claude_code_states')
    .where('user_id', owner.id)
    .where('version', version)
    .update({ files: sealFiles(owner, files), version: version + 1, updated_at: new Date() })
  return Number(Array.isArray(updated) ? updated[0] : updated) > 0
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
  options: LockOptions = {},
): Promise<T> {
  const token = await acquire(owner, options.waitMs ?? CLAUDE_LOCK_WAIT_MS, options.signal)
  if (token === null) throw new LlmCallError(LlmFailureReason.Timeout)
  try {
    options.signal?.throwIfAborted()
    return await use()
  } finally {
    await release(owner, token)
  }
}

/**
 * Runs `use` with a private folder holding the account's saved state, one launch per account at
 * a time, then writes back the files the binary changed (a refreshed token) and removes the
 * folder. A file the launch left missing or cut keeps its saved content. Fails with
 * `subscription_expired` when the account has no readable state, and with `timeout` when the
 * launch before it held the account longer than `waitMs`. With `drop`, nothing is written back
 * and the state is deleted once `use` ends, whatever it answered (signing out).
 */
export async function withClaudeFolder<T>(
  owner: Owner,
  use: (dir: string) => Promise<T>,
  options: LockOptions & { drop?: boolean } = {},
): Promise<T> {
  return withClaudeLock(
    owner,
    async () => {
      const row = await ClaudeCodeState.findBy('userId', owner.id)
      const before = row === null ? null : filesOf(row)
      if (row === null || before === null) {
        throw new LlmCallError(LlmFailureReason.SubscriptionExpired)
      }
      const dir = await makeClaudeFolder()
      try {
        await writeClaudeFolder(dir, before)
        const result = await use(dir)
        if (!options.drop) {
          const after = { ...before, ...(await readWholeFiles(dir)) }
          if (!sameFiles(before, after)) await writeBack(owner, row.version, after)
        }
        return result
      } finally {
        await removeClaudeFolder(dir)
        if (options.drop) await deleteClaudeState(owner)
      }
    },
    options,
  )
}

/** An account's folder from before the state moved to the database: `<CLAUDE_CODE_HOME>/<id>`. */
const ACCOUNT_FOLDER = /^\d+$/

/** A short-lived folder older than the longest sign-in was left by a process that died. */
const STALE_RUN_MS = CLAUDE_LOGIN_TIMEOUT_MS + CLAUDE_LOCK_TTL_MS

export type ClaudeImport = {
  /** States moved from an account folder into the database. */
  imported: number
  /** Account folders removed: imported, already in the database, or of an account gone. */
  removed: number
  /** Account folders left where they are: credentials there, but too large or cut to read. */
  kept: number
  /** Short-lived folders a process that died left behind, removed. */
  purged: number
}

/**
 * Moves the Claude subscriptions still held in account folders (`<CLAUDE_CODE_HOME>/<user id>`,
 * from before `claude_code_states`) into the database, then removes those folders. A folder is
 * removed without being imported when its account is gone, when the account already has a
 * readable state, or when it holds no credentials at all; one whose credentials cannot be read
 * whole is left alone. Short-lived folders (`run-*`) older than any launch or sign-in are left by a
 * process that died and are removed. Run at every start (`node ace claude:import`), with the API
 * stopped (an API of the image before reads the folders without the lock); a second run finds
 * nothing.
 */
export async function importClaudeFolders(): Promise<ClaudeImport> {
  const root = llmConfig.claudeCodeHome
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const outcome: ClaudeImport = { imported: 0, removed: 0, kept: 0, purged: 0 }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    if (entry.name.startsWith(RUN_PREFIX)) {
      const info = await stat(dir).catch(() => null)
      if (info && Date.now() - info.mtimeMs > STALE_RUN_MS) {
        await removeClaudeFolder(dir)
        outcome.purged++
      }
      continue
    }
    if (!ACCOUNT_FOLDER.test(entry.name)) continue
    const owner = { id: Number(entry.name) }
    if ((await User.find(owner.id)) !== null) {
      const files = await readClaudeFolder(dir)
      if (files === null) {
        const credentials = await stat(join(dir, CLAUDE_CREDENTIALS_FILE)).catch(() => null)
        if (credentials !== null) {
          outcome.kept++
          continue
        }
      } else {
        const saved = await withClaudeLock(owner, async () => {
          if ((await claudeState(owner)) !== null) return false
          await saveClaudeState(owner, files)
          return true
        })
        if (saved) outcome.imported++
      }
    }
    await removeClaudeFolder(dir)
    outcome.removed++
  }
  return outcome
}

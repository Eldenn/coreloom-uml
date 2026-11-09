import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import redis from '@adonisjs/redis/services/main'
import { CODEX_OAUTH } from '@coreloom-uml/llm'
import {
  CODEX_ATTEMPT_TTL_SECONDS,
  CodexAttemptStatus,
} from '#app/llm-connections/constants/llm-connections'
import { saveCodexTokens } from '#app/llm-connections/services/codex-connections'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'
import type User from '#app/users/models/user'

type Person = Pick<User, 'id'>

/** How long one poll keeps its lock while it exchanges the code (above the OAuth timeout). */
const EXCHANGE_LOCK_SECONDS = 30

/** An attempt as kept in Redis. The device id never leaves the server. */
type StoredAttempt = {
  userId: number
  deviceAuthId: string
  userCode: string
  intervalSeconds: number
  expiresAt: string
  status: CodexAttemptStatus
}

export type StartedAttempt = {
  attemptId: string
  verificationUrl: string
  userCode: string
  interval: number
  expiresAt: string
}

export function attemptKey(attemptId: string): string {
  return `llm:codex-attempt:${attemptId}`
}

async function store(attemptId: string, attempt: StoredAttempt): Promise<void> {
  const ttl = Math.max(1, Math.ceil((Date.parse(attempt.expiresAt) - Date.now()) / 1000) + 60)
  await redis.set(attemptKey(attemptId), JSON.stringify(attempt), 'EX', ttl)
}

/** Asks OpenAI for a code the user types on its page. */
export async function startCodexAttempt(user: Person): Promise<StartedAttempt> {
  const oauth = await app.container.make(CodexOAuth)
  const code = await oauth.requestDeviceCode()
  const attemptId = randomUUID()
  const expiresAt = new Date(Date.now() + CODEX_ATTEMPT_TTL_SECONDS * 1000).toISOString()
  await store(attemptId, {
    userId: user.id,
    deviceAuthId: code.deviceAuthId,
    userCode: code.userCode,
    intervalSeconds: code.intervalSeconds,
    expiresAt,
    status: CodexAttemptStatus.Pending,
  })
  return {
    attemptId,
    verificationUrl: CODEX_OAUTH.verificationUrl,
    userCode: code.userCode,
    interval: code.intervalSeconds,
    expiresAt,
  }
}

/**
 * Where the user's attempt stands, or `null` when it is not theirs or not known. A pending
 * attempt asks OpenAI once, at most once per interval (a lock in Redis, so two polls never
 * exchange the same code); on success the tokens are stored and the attempt stays `connected`
 * until it expires from Redis.
 */
export async function checkCodexAttempt(
  user: Person,
  attemptId: string,
): Promise<CodexAttemptStatus | null> {
  const raw = await redis.get(attemptKey(attemptId))
  if (!raw) return null
  const attempt = JSON.parse(raw) as StoredAttempt
  if (attempt.userId !== user.id) return null
  if (attempt.status !== CodexAttemptStatus.Pending) return attempt.status

  const settle = async (status: CodexAttemptStatus) => {
    await store(attemptId, { ...attempt, status })
    return status
  }
  if (Date.parse(attempt.expiresAt) <= Date.now()) return settle(CodexAttemptStatus.Expired)

  const lock = await redis.set(
    `${attemptKey(attemptId)}:lock`,
    '1',
    'EX',
    attempt.intervalSeconds,
    'NX',
  )
  if (lock !== 'OK') return CodexAttemptStatus.Pending

  const oauth = await app.container.make(CodexOAuth)
  let result: Awaited<ReturnType<CodexOAuth['poll']>>
  try {
    result = await oauth.poll(attempt)
  } catch (error) {
    // A passing failure on OpenAI's side: the attempt keeps waiting.
    logger.warn({ userId: user.id, error: (error as Error).name }, 'codex device poll failed')
    return CodexAttemptStatus.Pending
  }
  if (result === 'pending') return CodexAttemptStatus.Pending
  if (result === 'denied') return settle(CodexAttemptStatus.Denied)
  // The exchange may outlast the poll interval: hold the lock until it is done.
  await redis.expire(`${attemptKey(attemptId)}:lock`, EXCHANGE_LOCK_SECONDS)
  try {
    await saveCodexTokens(user, await oauth.exchange(result))
  } catch (error) {
    logger.warn({ userId: user.id, error: (error as Error).name }, 'codex token exchange failed')
    // Another poll may have connected the account meanwhile: never undo that.
    const latest = await redis.get(attemptKey(attemptId))
    const status = latest ? (JSON.parse(latest) as StoredAttempt).status : null
    if (status === CodexAttemptStatus.Connected) return status
    return settle(CodexAttemptStatus.Denied)
  }
  logger.info({ userId: user.id }, 'chatgpt subscription connected')
  return settle(CodexAttemptStatus.Connected)
}

import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import {
  type CodexCredential,
  CodexGrantError,
  type CodexTokens,
  failureReason,
  LlmCallError,
  LlmFailureReason,
} from '@coreloom-uml/llm'
import { DateTime } from 'luxon'
import {
  CODEX_REFRESH_MARGIN_MS,
  ProviderKind,
} from '#app/llm-connections/constants/llm-connections'
import LlmConnection from '#app/llm-connections/models/llm-connection'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'
import type User from '#app/users/models/user'

const KIND = ProviderKind.OpenAICodex

type Person = Pick<User, 'id'>

function rowOf(user: Person, client?: Parameters<typeof LlmConnection.query>[0]) {
  return LlmConnection.query(client).where('user_id', user.id).where('kind', KIND)
}

function credentialOf(row: LlmConnection): CodexCredential {
  return { kind: KIND, accessToken: row.accessToken ?? '', accountId: row.accountId }
}

function readable(row: LlmConnection): boolean {
  return row.accessToken !== null && row.refreshToken !== null
}

function fresh(row: LlmConnection): boolean {
  return row.expiresAt.toMillis() - Date.now() > CODEX_REFRESH_MARGIN_MS
}

/** Stores (or replaces) the user's ChatGPT tokens, encrypted. */
export async function saveCodexTokens(user: Person, tokens: CodexTokens): Promise<void> {
  await LlmConnection.updateOrCreate(
    { userId: user.id, kind: KIND },
    {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: DateTime.fromJSDate(tokens.expiresAt),
      accountId: tokens.accountId,
    },
  )
}

/** Whether the user has a ChatGPT connection this server can read. Never refreshes. */
export async function codexConnected(user: Person): Promise<boolean> {
  const row = await rowOf(user).first()
  return row !== null && readable(row)
}

/**
 * What a call with the user's ChatGPT subscription needs, refreshed when it is about to expire;
 * `null` when not connected. An unreadable row (the `APP_KEY` changed) is deleted. A dead grant
 * deletes the row and throws `LlmCallError('subscription_expired')`; any other refresh failure
 * throws its reason. The refresh runs under a row lock, so two calls never spend the same
 * refresh token.
 */
export async function codexCredential(user: Person): Promise<CodexCredential | null> {
  const row = await rowOf(user).first()
  if (!row) return null
  if (!readable(row)) {
    await row.delete()
    return null
  }
  if (fresh(row)) return credentialOf(row)

  const outcome = await db.transaction(async (trx) => {
    const locked = await rowOf(user, { client: trx }).forUpdate().first()
    if (!locked) return null
    if (!readable(locked)) {
      await locked.delete()
      return null
    }
    if (fresh(locked)) return credentialOf(locked)
    const oauth = await app.container.make(CodexOAuth)
    let tokens: CodexTokens
    try {
      tokens = await oauth.refresh(locked.refreshToken ?? '')
    } catch (error) {
      if (error instanceof CodexGrantError) {
        await locked.delete()
        return LlmFailureReason.SubscriptionExpired
      }
      return failureReason(error)
    }
    locked.merge({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: DateTime.fromJSDate(tokens.expiresAt),
      accountId: tokens.accountId,
    })
    await locked.save()
    return credentialOf(locked)
  })
  if (typeof outcome === 'string') throw new LlmCallError(outcome)
  return outcome
}

export async function disconnectCodex(user: Person): Promise<void> {
  await rowOf(user).delete()
}

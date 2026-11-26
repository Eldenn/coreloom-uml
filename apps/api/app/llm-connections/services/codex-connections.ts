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
  LlmSecretPurpose,
  ProviderKind,
} from '#app/llm-connections/constants/llm-connections'
import LlmConnection from '#app/llm-connections/models/llm-connection'
import CodexOAuth from '#app/llm-connections/services/codex-oauth'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'
import type User from '#app/users/models/user'

const KIND = ProviderKind.OpenAICodex

type Person = Pick<User, 'id'>

/** A row's tokens, opened. */
type OpenTokens = { accessToken: string; refreshToken: string }

function rowOf(user: Person, client?: Parameters<typeof LlmConnection.query>[0]) {
  return LlmConnection.query(client).where('user_id', user.id).where('kind', KIND)
}

/**
 * The row's tokens, or `null` when they cannot be read: the keys changed, or the row was sealed
 * for another account or before the tokens were bound to their owner.
 */
function tokensOf(row: LlmConnection): OpenTokens | null {
  const owner = { id: row.userId }
  const accessToken = openLlmSecret(row.sealedAccessToken, LlmSecretPurpose.Connection, owner)
  const refreshToken = openLlmSecret(row.sealedRefreshToken, LlmSecretPurpose.Connection, owner)
  return accessToken === null || refreshToken === null ? null : { accessToken, refreshToken }
}

/** The columns of a connection holding these tokens, sealed for their owner. */
function sealedColumns(user: Person, tokens: CodexTokens) {
  return {
    sealedAccessToken: sealLlmSecret(tokens.accessToken, LlmSecretPurpose.Connection, user),
    sealedRefreshToken: sealLlmSecret(tokens.refreshToken, LlmSecretPurpose.Connection, user),
    expiresAt: DateTime.fromJSDate(tokens.expiresAt),
    accountId: tokens.accountId,
  }
}

function credentialOf(row: LlmConnection, tokens: OpenTokens): CodexCredential {
  return { kind: KIND, accessToken: tokens.accessToken, accountId: row.accountId }
}

function fresh(row: LlmConnection): boolean {
  return row.expiresAt.toMillis() - Date.now() > CODEX_REFRESH_MARGIN_MS
}

/** Stores (or replaces) the user's ChatGPT tokens, sealed for them. */
export async function saveCodexTokens(user: Person, tokens: CodexTokens): Promise<void> {
  await LlmConnection.updateOrCreate({ userId: user.id, kind: KIND }, sealedColumns(user, tokens))
}

/** Whether the user has a ChatGPT connection this server can read. Never refreshes. */
export async function codexConnected(user: Person): Promise<boolean> {
  const row = await rowOf(user).first()
  return row !== null && tokensOf(row) !== null
}

/**
 * What a call with the user's ChatGPT subscription needs, refreshed when it is about to expire;
 * `null` when not connected. An unreadable row (the keys changed) is deleted. A dead grant
 * deletes the row and throws `LlmCallError('subscription_expired')`; any other refresh failure
 * throws its reason. The refresh runs under a row lock, so two calls never spend the same
 * refresh token.
 */
export async function codexCredential(user: Person): Promise<CodexCredential | null> {
  const row = await rowOf(user).first()
  if (!row) return null
  const opened = tokensOf(row)
  if (opened === null) {
    await row.delete()
    return null
  }
  if (fresh(row)) return credentialOf(row, opened)

  const outcome = await db.transaction(async (trx) => {
    const locked = await rowOf(user, { client: trx }).forUpdate().first()
    if (!locked) return null
    const current = tokensOf(locked)
    if (current === null) {
      await locked.delete()
      return null
    }
    if (fresh(locked)) return credentialOf(locked, current)
    const oauth = await app.container.make(CodexOAuth)
    let tokens: CodexTokens
    try {
      tokens = await oauth.refresh(current.refreshToken)
    } catch (error) {
      if (error instanceof CodexGrantError) {
        await locked.delete()
        return LlmFailureReason.SubscriptionExpired
      }
      return failureReason(error)
    }
    locked.merge(sealedColumns(user, tokens))
    await locked.save()
    return credentialOf(locked, tokens)
  })
  if (typeof outcome === 'string') throw new LlmCallError(outcome)
  return outcome
}

export async function disconnectCodex(user: Person): Promise<void> {
  await rowOf(user).delete()
}

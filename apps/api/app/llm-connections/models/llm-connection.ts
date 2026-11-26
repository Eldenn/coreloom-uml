import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { ProviderKind } from '#app/llm-connections/constants/llm-connections'

/** A connected subscription (see the `llm_connections` migration). */
export default class LlmConnection extends BaseModel {
  static table = 'llm_connections'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare kind: ProviderKind

  /**
   * The tokens, sealed by `llmKeys` and bound to their owner (`llm-secrets.ts`); only
   * `codex-connections.ts` seals or opens them. Never serialized.
   */
  @column({ columnName: 'access_token', serializeAs: null })
  declare sealedAccessToken: string

  @column({ columnName: 'refresh_token', serializeAs: null })
  declare sealedRefreshToken: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column({ serializeAs: null })
  declare accountId: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

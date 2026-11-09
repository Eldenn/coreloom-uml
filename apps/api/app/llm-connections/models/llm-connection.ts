import encryption from '@adonisjs/core/services/encryption'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { ProviderKind } from '#app/llm-connections/constants/llm-connections'

/**
 * Encrypted with `APP_KEY` on write; `null` on read when it cannot be decrypted (the key changed),
 * which the services treat as "not connected". Never serialized.
 */
const secret = {
  prepare: (value: string) => encryption.encrypt(value),
  consume: (value: string): string | null => encryption.decrypt<string>(value) ?? null,
  serializeAs: null,
}

/** A connected subscription (see the `llm_connections` migration). */
export default class LlmConnection extends BaseModel {
  static table = 'llm_connections'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare kind: ProviderKind

  @column(secret)
  declare accessToken: string | null

  @column(secret)
  declare refreshToken: string | null

  @column.dateTime()
  declare expiresAt: DateTime

  @column({ serializeAs: null })
  declare accountId: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

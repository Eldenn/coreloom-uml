import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { LlmSecretPurpose, type ProviderKind } from '#app/llm-connections/constants/llm-connections'
import {
  openLegacyAppSecret,
  openLlmSecret,
  sealLlmSecret,
} from '#app/llm-connections/services/llm-secrets'

/**
 * Encrypted with the dedicated `llmKeys` encrypter on write, bound to its purpose. A row sealed
 * before that (with `APP_KEY`, no purpose) is still read until it is rewritten; the migration
 * `reseal-llm-connections` moves the existing ones. `null` on read when neither can decrypt it
 * (a key changed), which the services treat as "not connected". Never serialized.
 */
const secret = {
  prepare: (value: string) => sealLlmSecret(value, LlmSecretPurpose.Connection),
  consume: (value: string): string | null =>
    openLlmSecret(value, LlmSecretPurpose.Connection) ?? openLegacyAppSecret(value),
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

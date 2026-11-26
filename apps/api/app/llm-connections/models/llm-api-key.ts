import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'

/**
 * Encrypted with the dedicated `llmKeys` encrypter on write; `null` for a kind that calls a
 * server without a key, and on read when the ciphertext cannot be decrypted (the key changed) —
 * which the services treat as "no key saved". Never serialized.
 */
const secret = {
  prepare: (value: string | null) =>
    value === null ? null : sealLlmSecret(value, LlmSecretPurpose.ApiKey),
  consume: (value: string | null): string | null =>
    value === null ? null : openLlmSecret(value, LlmSecretPurpose.ApiKey),
  serializeAs: null,
}

/** A provider API key the account saved (see the `llm_api_keys` migration). */
export default class LlmApiKey extends BaseModel {
  static table = 'llm_api_keys'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare kind: string

  @column(secret)
  declare apiKey: string | null

  /** The last four characters of the key, plain: what the settings screen shows. */
  @column()
  declare keyHint: string

  /** The origin the key was saved with (`baseUrlProblem` checked it); a call reads it from here. */
  @column()
  declare baseUrl: string | null

  @column.dateTime()
  declare verifiedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

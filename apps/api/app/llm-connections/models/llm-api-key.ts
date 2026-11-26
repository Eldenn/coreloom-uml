import encryption from '@adonisjs/core/services/encryption'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/**
 * Binds a stored provider key to this table: a ciphertext copied anywhere else (another row,
 * another column, another flow) fails to decrypt.
 */
export const LLM_API_KEY_PURPOSE = 'llm-api-key'

/**
 * Encrypted with the dedicated `llmKeys` encrypter on write; `null` on read when it cannot be
 * decrypted (the key changed), which the services treat as "no key saved". Never serialized.
 */
const secret = {
  prepare: (value: string) =>
    encryption.use('llmKeys').encrypt(value, { purpose: LLM_API_KEY_PURPOSE }),
  consume: (value: string): string | null =>
    encryption.use('llmKeys').decrypt<string>(value, LLM_API_KEY_PURPOSE) ?? null,
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

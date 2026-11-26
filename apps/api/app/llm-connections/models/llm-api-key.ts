import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/** A provider API key the account saved (see the `llm_api_keys` migration). */
export default class LlmApiKey extends BaseModel {
  static table = 'llm_api_keys'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare kind: string

  /**
   * The key, sealed by `llmKeys` and bound to its owner (`llm-secrets.ts`); only
   * `llm-api-keys.ts` seals or opens it. `null` for a kind that calls a server without a key.
   * Never serialized.
   */
  @column({ columnName: 'api_key', serializeAs: null })
  declare sealedKey: string | null

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

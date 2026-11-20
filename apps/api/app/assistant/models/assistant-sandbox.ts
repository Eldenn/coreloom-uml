import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/**
 * The repository sandbox of an assistant conversation (one at most): which E2B sandbox holds the
 * clone of which repository. The code is only in the sandbox. Never serialized.
 */
export default class AssistantSandbox extends BaseModel {
  static table = 'assistant_sandboxes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare userId: number

  @column({ serializeAs: null })
  declare sandboxId: string

  @column()
  declare repositoryUrl: string

  @column()
  declare branch: string | null

  @column()
  declare commitSha: string

  @column()
  declare private: boolean

  @column.dateTime()
  declare lastUsedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}

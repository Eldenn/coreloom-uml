import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { FilePart } from '@coreloom-uml/llm'
import type { DateTime } from 'luxon'

/**
 * A file attached to an assistant conversation. Its text lives in Drive (`storageKey`), read on
 * demand; the row holds its name, its length and the summary of each part. Never serialized.
 */
export default class AssistantFile extends BaseModel {
  static table = 'assistant_files'
  // Files are never edited: no `updated_at`.

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  @column()
  declare userId: number

  @column()
  declare name: string

  /** The length of its text, in characters. */
  @column()
  declare chars: number

  @column({ serializeAs: null })
  declare storageKey: string

  @column({
    prepare: (value: FilePart[]) => JSON.stringify(value),
    serializeAs: null,
  })
  declare parts: FilePart[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}

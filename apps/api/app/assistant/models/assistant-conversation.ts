import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import Architecture from '#app/architectures/models/architecture'
import AssistantMessage from '#app/assistant/models/assistant-message'
import User from '#app/users/models/user'

/** A chat with the workspace assistant about one architecture, private to its owner. */
export default class AssistantConversation extends BaseModel {
  static table = 'assistant_conversations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare architectureId: number

  @column()
  declare userId: number

  @column()
  declare title: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Architecture)
  declare architecture: BelongsTo<typeof Architecture>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => AssistantMessage, { foreignKey: 'conversationId' })
  declare messages: HasMany<typeof AssistantMessage>
}

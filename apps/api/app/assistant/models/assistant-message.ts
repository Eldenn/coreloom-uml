import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type {
  AssistantRole,
  StoredAction,
  StoredChange,
  StoredProposals,
} from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'

const json = { prepare: (value: unknown) => (value === null ? null : JSON.stringify(value)) }

export default class AssistantMessage extends BaseModel {
  static table = 'assistant_messages'
  // Messages are never edited: no `updated_at`.

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare conversationId: number

  /** The architecture this message is about; null for none (or once it was deleted). */
  @column()
  declare architectureId: number | null

  @column()
  declare role: AssistantRole

  @column()
  declare content: string

  /** The diagram changes this message proposed; null when it proposed none. */
  @column(json)
  declare changes: StoredChange[] | null

  /** What a web research proposed, for the owner to add; null on any other message. */
  @column(json)
  declare proposals: StoredProposals | null

  /** The actions on the account's work this message proposed; null when it proposed none. */
  @column(json)
  declare actions: StoredAction[] | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => AssistantConversation, { foreignKey: 'conversationId' })
  declare conversation: BelongsTo<typeof AssistantConversation>
}

import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { SuggestedDiagramKind } from '@coreloom-uml/llm'
import type { DateTime } from 'luxon'
import type { CodeMapSuggestionStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** A diagram the owner's model proposed for a code map, and what the owner did with it. */
export default class CodeMapSuggestion extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare codeMapId: number

  @column()
  declare kind: SuggestedDiagramKind

  @column()
  declare title: string

  @column()
  declare reason: string

  /**
   * The code it covers, as code map keys: folders (`path/`) or classes for a structural view,
   * the one start (an entry point or a function nothing calls) for a sequence or activity view.
   */
  @column(json)
  declare focus: string[]

  @column()
  declare status: CodeMapSuggestionStatus

  @column()
  declare position: number

  /** Where it was drawn, once drafted. */
  @column()
  declare architectureId: number | null

  @column()
  declare conversationId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => CodeMap)
  declare codeMap: BelongsTo<typeof CodeMap>
}

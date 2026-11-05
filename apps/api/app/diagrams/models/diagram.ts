import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import Architecture from '#app/architectures/models/architecture'
import type { DiagramFormat, DiagramKind } from '#app/diagrams/constants/diagram'

/** The coreloom-ui UML JSON, kept as an opaque object on this side. */
export type DiagramContent = { kind: DiagramKind } & Record<string, unknown>

/** One UML diagram (a view) of an architecture. */
export default class Diagram extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare architectureId: number

  @column()
  declare title: string

  @column()
  declare kind: DiagramKind

  @column()
  declare format: DiagramFormat

  @column({
    prepare: (value: DiagramContent | null) => (value === null ? null : JSON.stringify(value)),
  })
  declare content: DiagramContent | null

  @column()
  declare position: number

  @column()
  declare version: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Architecture)
  declare architecture: BelongsTo<typeof Architecture>
}

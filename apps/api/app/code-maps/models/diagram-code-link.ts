import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { DiagramCodeLinkStatus } from '#app/code-maps/constants/code-map'
import Diagram from '#app/diagrams/models/diagram'

/**
 * The owner's decision about one element of a diagram and one place in the code (a node key, or
 * a folder key such as `apps/api/`). Not tied to a map: it outlives the map it was made on.
 */
export default class DiagramCodeLink extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare diagramId: number

  @column()
  declare elementId: string

  @column()
  declare codeKey: string

  @column()
  declare status: DiagramCodeLinkStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Diagram)
  declare diagram: BelongsTo<typeof Diagram>
}

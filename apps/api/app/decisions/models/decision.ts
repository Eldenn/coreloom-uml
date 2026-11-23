import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { DecisionOption, DecisionStatus } from '#app/decisions/constants/decision'
import Diagram from '#app/diagrams/models/diagram'
import Requirement from '#app/requirements/models/requirement'

/**
 * An architecture decision of a project: the options weighed and the one chosen, the
 * requirements it serves and the diagrams it shapes.
 */
export default class Decision extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare projectId: number

  @column()
  declare userId: number

  @column()
  declare title: string

  @column()
  declare context: string | null

  @column({ prepare: (value: DecisionOption[]) => JSON.stringify(value) })
  declare options: DecisionOption[]

  /** The name of the option chosen, one of `options`; null while nothing is decided. */
  @column()
  declare chosen: string | null

  @column()
  declare consequences: string | null

  @column()
  declare status: DecisionStatus

  /** The decision of the same project that replaced this one. */
  @column()
  declare supersededById: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @manyToMany(() => Requirement, { pivotTable: 'decision_requirements' })
  declare requirements: ManyToMany<typeof Requirement>

  @manyToMany(() => Diagram, { pivotTable: 'decision_diagrams' })
  declare diagrams: ManyToMany<typeof Diagram>
}

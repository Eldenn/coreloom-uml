import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DecisionPartType } from '#app/decisions/constants/decision'

/** A part of a view a decision names: its view, its type and the one line that names it there. */
export default class DecisionPart extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare decisionId: number

  @column()
  declare diagramId: number

  @column()
  declare type: DecisionPartType

  @column()
  declare label: string
}

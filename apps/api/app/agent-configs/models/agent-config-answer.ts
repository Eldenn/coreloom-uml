import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { AnswerValue } from '@coreloom-uml/catalog'
import type { DateTime } from 'luxon'

/** The answer to one question of a configuration's questionnaire. */
export default class AgentConfigAnswer extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentConfigId: number

  @column()
  declare questionnaireId: string

  @column()
  declare questionId: string

  /** A scale (number), one option or a text (string), or several options (string[]). */
  @column({ prepare: (value: AnswerValue) => JSON.stringify(value) })
  declare value: AnswerValue

  /** "More details": never rendered as is, only the input of rule proposals. */
  @column()
  declare details: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

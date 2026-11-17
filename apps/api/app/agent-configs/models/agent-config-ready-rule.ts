import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/** A ready-made rule of the catalog a configuration holds: its group's slot and its id. */
export default class AgentConfigReadyRule extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentConfigId: number

  @column()
  declare slot: string

  @column()
  declare rule: string

  /** The text typed into a rule that takes one, null otherwise. */
  @column()
  declare value: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

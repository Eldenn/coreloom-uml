import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { AgentRuleSource } from '#app/agent-configs/constants/agent-config'

/** An accepted rule: one line added at the end of a section of AGENTS.md. */
export default class AgentConfigRule extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentConfigId: number

  @column()
  declare section: string

  @column()
  declare text: string

  @column()
  declare source: AgentRuleSource

  /** Order among the configuration's rules, from 0. */
  @column()
  declare position: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import CatalogSkill from '#app/skills/models/catalog-skill'

/** A skill a configuration holds: `pull` installs its newest approved copy. */
export default class AgentConfigSkill extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentConfigId: number

  @column()
  declare skillId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => CatalogSkill, { foreignKey: 'skillId' })
  declare skill: BelongsTo<typeof CatalogSkill>
}

import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { SkillAudit } from '#app/skills/models/catalog-skill'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** What a search run learnt about one skill (see the `skill_snapshots` migration). */
export default class SkillSnapshot extends BaseModel {
  static table = 'skill_snapshots'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare skillId: number

  @column.dateTime()
  declare takenAt: DateTime

  @column()
  declare installs: number

  @column(json)
  declare audits: SkillAudit[]

  @column()
  declare eligible: boolean

  @column()
  declare ineligibleReason: string | null
}

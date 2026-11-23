import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type {
  RequirementCategory,
  RequirementPriority,
} from '#app/requirements/constants/requirement'

/** One thing a project's architecture has to hold, owned by the project's owner. */
export default class Requirement extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare projectId: number

  @column()
  declare userId: number

  @column()
  declare category: RequirementCategory

  @column()
  declare priority: RequirementPriority

  @column()
  declare statement: string

  /** How one tells it is met ("p95 under 300 ms at 500 requests a second"), when there is one. */
  @column()
  declare measure: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

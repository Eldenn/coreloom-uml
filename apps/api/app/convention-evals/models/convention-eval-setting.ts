import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { usdColumn as usd } from '#app/convention-evals/models/usd-column'

/** The instance's convention test settings (see the `convention_eval_settings` migration). */
export default class ConventionEvalSetting extends BaseModel {
  static table = 'convention_eval_settings'

  @column({ isPrimary: true })
  declare id: number

  @column(usd)
  declare capUsd: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

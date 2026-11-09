import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import User from '#app/users/models/user'

/** One change of a flag's state (see the `feature_flag_changes` migration). */
export default class FeatureFlagChange extends BaseModel {
  static table = 'feature_flag_changes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare flagKey: string

  @column()
  declare userId: number | null

  @column()
  declare text: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}

import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** A flag's stored state (see the `feature_flags` migration). */
export default class FeatureFlag extends BaseModel {
  static table = 'feature_flags'

  @column({ isPrimary: true })
  declare key: string

  /** Checked with `featureFlagStateSchema` when read: the column holds whatever was written. */
  @column(json)
  declare state: unknown

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

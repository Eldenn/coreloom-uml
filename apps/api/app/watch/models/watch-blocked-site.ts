import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/** A host (and its subdomains) whose articles the watch never takes in. */
export default class WatchBlockedSite extends BaseModel {
  static table = 'watch_blocked_sites'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare host: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}

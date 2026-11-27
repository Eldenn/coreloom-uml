import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { WatchFeedKind } from '#app/watch/constants/watch'
import WatchArticle from '#app/watch/models/watch-article'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** A feed the daily watch run reads (see the `watch_feeds` migration). */
export default class WatchFeed extends BaseModel {
  static table = 'watch_feeds'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare kind: WatchFeedKind

  @column()
  declare url: string

  /** The feed's own title, read at its last run that answered. */
  @column()
  declare title: string | null

  /** The admin's tags for what it publishes: an article's until the tagger reads it. */
  @column(json)
  declare topics: string[]

  @column()
  declare enabled: boolean

  @column.dateTime()
  declare lastRunAt: DateTime | null

  @column()
  declare lastError: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => WatchArticle, { foreignKey: 'feedId' })
  declare articles: HasMany<typeof WatchArticle>
}

import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

const json = { prepare: (value: unknown) => JSON.stringify(value) }
const nullableJson = {
  prepare: (value: unknown) => (value === null ? null : JSON.stringify(value)),
}

/** One article of the watch (see the `watch_articles` migration): never the page itself. */
export default class WatchArticle extends BaseModel {
  static table = 'watch_articles'

  @column({ isPrimary: true })
  declare id: number

  /** The feed it came from; null once that feed is deleted. */
  @column()
  declare feedId: number | null

  @column()
  declare url: string

  /** The link's host. */
  @column()
  declare site: string

  @column()
  declare title: string

  /** The item's description as plain text, cut: a stranger's text, never instructions. */
  @column()
  declare excerpt: string

  @column.dateTime()
  declare publishedAt: DateTime

  /** What everything reads (`effectiveTopics`): the admin's, else the tagger's, else the feed's. */
  @column(json)
  declare topics: string[]

  /** The feed's tags when the article was taken in. */
  @column(json)
  declare feedTopics: string[]

  /** The tags the tagger gave, null until it tagged this article. */
  @column(nullableJson)
  declare taggerTopics: string[] | null

  /** The tags the admin set, the first being the main one, which the tagger learns from. */
  @column(nullableJson)
  declare reviewedTopics: string[] | null

  @column()
  declare hidden: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

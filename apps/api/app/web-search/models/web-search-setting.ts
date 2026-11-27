import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { WebSearchKind } from '#app/web-search/constants/web-search'

/** The web search service of the instance (see the `web_search_settings` migration). */
export default class WebSearchSetting extends BaseModel {
  static table = 'web_search_settings'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare kind: WebSearchKind

  /**
   * The key, sealed by `llmKeys` and bound to the instance (`llm-secrets.ts`); only
   * `web-search-settings.ts` seals or opens it. Never serialized.
   */
  @column({ serializeAs: null })
  declare sealedKey: string

  /** The last four characters of the key, plain: what the admin screen shows. */
  @column()
  declare keyHint: string

  @column.dateTime()
  declare verifiedAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

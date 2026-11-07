import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type { ApiTokenAbility } from '#app/api-tokens/constants/api-token'

/**
 * A row of `auth_access_tokens`, read for the account page. Tokens are created
 * and verified by `User.accessTokens` (`DbAccessTokensProvider`); this model
 * only lists, labels and revokes them; it has no `hash` attribute.
 */
export default class ApiToken extends BaseModel {
  static table = 'auth_access_tokens'

  @column({ isPrimary: true })
  declare id: number

  /** The owner, named `userId` so `assertOwner` applies as everywhere else. */
  @column({ columnName: 'tokenable_id' })
  declare userId: number

  @column()
  declare type: string

  @column()
  declare name: string | null

  @column()
  declare hint: string | null

  /** Stored as a JSON array in a text column, as the provider writes it. */
  @column({
    prepare: (value: ApiTokenAbility[]) => JSON.stringify(value),
    consume: (value: string | ApiTokenAbility[]) =>
      typeof value === 'string' ? JSON.parse(value) : value,
  })
  declare abilities: ApiTokenAbility[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column.dateTime()
  declare lastUsedAt: DateTime | null

  @column.dateTime()
  declare expiresAt: DateTime | null
}

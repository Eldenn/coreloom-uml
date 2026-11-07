import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { API_TOKEN_PREFIX, API_TOKEN_TYPE } from '#app/api-tokens/constants/api-token'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string | null

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column.dateTime()
  declare emailVerifiedAt: DateTime | null

  /**
   * Object-storage key of the avatar in @adonisjs/drive (e.g. `avatars/42.png`),
   * or null. The wire shape exposes it as the relative path `/account/avatar`
   * via `serializeUser`, never as a signed URL.
   */
  @column({ serializeAs: null })
  declare avatarKey: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  /** API tokens (`api` guard), listed and revoked through `ApiToken`. */
  static accessTokens = DbAccessTokensProvider.forModel(User, {
    prefix: API_TOKEN_PREFIX,
    type: API_TOKEN_TYPE,
  })
}

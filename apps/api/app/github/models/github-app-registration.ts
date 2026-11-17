import encryption from '@adonisjs/core/services/encryption'
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { TokenPurpose } from '#app/auth/constants/token-purpose'
import type { GithubAppOwnerType } from '#app/github/constants/github'

/** The App's secrets, as GitHub gave them when it was created. */
export type GithubAppCredentials = {
  clientSecret: string
  /** The PEM GitHub generated. */
  privateKey: string
  /** Null when the App was created without a webhook (an API GitHub cannot reach). */
  webhookSecret: string | null
}

/** Postgres answers `bigint` as a string; GitHub's ids fit a JS number. */
const bigint = { consume: (value: string | number) => Number(value) }

/**
 * Encrypted with `APP_KEY` on write; `null` on read when it cannot be decrypted (the key changed),
 * which turns the App off. Never serialized.
 */
const credentials = {
  prepare: (value: GithubAppCredentials) =>
    encryption.encrypt(value, { purpose: TokenPurpose.GithubAppCredentials }),
  consume: (value: string): GithubAppCredentials | null =>
    encryption.decrypt<GithubAppCredentials>(value, TokenPurpose.GithubAppCredentials) ?? null,
  serializeAs: null,
}

/** The GitHub App created from the settings (see the `github_app_registrations` migration). */
export default class GithubAppRegistration extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column(bigint)
  declare appId: number

  @column()
  declare slug: string

  @column()
  declare name: string

  @column()
  declare clientId: string

  @column()
  declare ownerLogin: string

  @column()
  declare ownerType: GithubAppOwnerType

  @column(credentials)
  declare credentials: GithubAppCredentials | null

  @column()
  declare createdByUserId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

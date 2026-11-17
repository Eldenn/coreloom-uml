import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import User from '#app/users/models/user'

/** Postgres answers `bigint` as a string; GitHub's ids fit a JS number. */
const bigint = { consume: (value: string | number) => Number(value) }

/**
 * A GitHub repository its owner can read through one of the GitHub App's installations, as GitHub
 * listed it at the last connection. No token: one is made for each clone and revoked after.
 */
export default class GithubRepositoryGrant extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column(bigint)
  declare githubUserId: number

  @column()
  declare githubLogin: string

  @column(bigint)
  declare installationId: number

  @column(bigint)
  declare repositoryId: number

  @column()
  declare owner: string

  @column()
  declare name: string

  @column()
  declare private: boolean

  @column()
  declare defaultBranch: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  /** `https://github.com/<owner>/<name>`, as `parseGithubRepository` writes it. */
  get url(): string {
    return `https://github.com/${this.owner}/${this.name}`
  }
}

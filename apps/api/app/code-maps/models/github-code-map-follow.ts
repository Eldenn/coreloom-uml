import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'

/**
 * A project following a GitHub repository through the GitHub App: each push on `branch` (the
 * default branch when null) reads it into a new code map. At most one per project.
 */
export default class GithubCodeMapFollow extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare projectId: number

  @column()
  declare userId: number

  @column({ consume: (value: string | number) => Number(value) })
  declare repositoryId: number

  @column()
  declare repositoryUrl: string

  @column()
  declare branch: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>
}

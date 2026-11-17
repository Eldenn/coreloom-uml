import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { CodeReviewDiagram } from '#app/code-reviews/constants/code-review'
import CodeReviewFinding from '#app/code-reviews/models/code-review-finding'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/**
 * A conformance review: some diagrams of a project checked against one of its code maps, one
 * model call per diagram, made by the browser in turn. The findings are stored; the key never is.
 */
export default class CodeReview extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare projectId: number

  @column()
  declare userId: number

  /** Null once the map is deleted: the findings stay. */
  @column()
  declare codeMapId: number | null

  @column()
  declare repositoryUrl: string | null

  @column()
  declare branch: string | null

  @column()
  declare commitSha: string | null

  /** The provider and model of the last call, without any key. */
  @column()
  declare providerKind: string | null

  @column()
  declare model: string | null

  @column()
  declare includeSnippets: boolean

  @column()
  declare locale: 'en' | 'fr'

  @column(json)
  declare diagrams: CodeReviewDiagram[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @hasMany(() => CodeReviewFinding)
  declare findings: HasMany<typeof CodeReviewFinding>
}

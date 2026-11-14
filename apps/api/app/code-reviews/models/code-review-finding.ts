import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type {
  CodeReviewEvidence,
  CodeReviewResolution,
  ConformanceSeverity,
  ConformanceStatus,
} from '#app/code-reviews/constants/code-review'
import CodeReview from '#app/code-reviews/models/code-review'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** One finding of a review about one diagram, and what its owner did with it. */
export default class CodeReviewFinding extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare codeReviewId: number

  @column()
  declare diagramId: number

  /** Null when the finding is about the diagram as a whole. */
  @column()
  declare elementId: string | null

  @column()
  declare status: ConformanceStatus

  @column()
  declare severity: ConformanceSeverity

  @column()
  declare comment: string

  @column(json)
  declare evidence: CodeReviewEvidence[]

  @column()
  declare resolution: CodeReviewResolution

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => CodeReview)
  declare review: BelongsTo<typeof CodeReview>
}

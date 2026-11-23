import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import type {
  CodeReviewResolution,
  ConformanceSeverity,
} from '#app/code-reviews/constants/code-review'

/**
 * One finding of the owner's model about an architecture, read against its project's
 * requirements and decisions, and what the owner did with it.
 */
export default class DesignFinding extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare projectId: number

  @column()
  declare userId: number

  @column()
  declare architectureId: number

  /** Null once the requirement is deleted, or when the finding is about a decision only. */
  @column()
  declare requirementId: number | null

  @column()
  declare decisionId: number | null

  /** The view that shows it; null for the architecture as a whole, or once the view is deleted. */
  @column()
  declare diagramId: number | null

  @column()
  declare severity: ConformanceSeverity

  @column()
  declare comment: string

  @column()
  declare resolution: CodeReviewResolution

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { usdColumn as usd } from '#app/convention-evals/models/usd-column'

/**
 * One trial of a convention test. `output` and the reasons were filtered for secrets before they
 * were stored; a trial that leaked keeps no output (`errorReason` = `leaked`).
 */
export default class ConventionEvalTrial extends BaseModel {
  static table = 'convention_eval_trials'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare runId: number

  @column()
  declare taskId: string

  @column()
  declare ruleSlot: string

  @column()
  declare ruleId: string

  @column()
  declare condition: string

  @column()
  declare attempt: number

  @column()
  declare successVerdict: string | null

  @column()
  declare successReason: string | null

  @column()
  declare complianceVerdict: string | null

  @column()
  declare complianceReason: string | null

  @column()
  declare errorReason: string | null

  @column()
  declare inputTokens: number

  @column()
  declare cachedInputTokens: number

  @column()
  declare cacheWriteTokens: number

  @column()
  declare outputTokens: number

  @column(usd)
  declare costUsd: number | null

  @column()
  declare durationMs: number

  @column()
  declare output: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}

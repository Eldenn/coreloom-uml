import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type {
  EvalAgent,
  EvalFailureReason,
  EvalPath,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalTrial from '#app/convention-evals/models/convention-eval-trial'
import { usdColumn as usd } from '#app/convention-evals/models/usd-column'
import type { ProviderKind } from '#app/llm-connections/constants/llm-connections'

/**
 * A convention test of an agent configuration: who ran it (`userId`, the configuration's owner),
 * how and with what, and how it ended. Its trials hold the verdicts. No credential, ever.
 */
export default class ConventionEvalRun extends BaseModel {
  static table = 'convention_eval_runs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare agentConfigId: number

  @column()
  declare path: EvalPath

  @column()
  declare agent: EvalAgent

  @column()
  declare providerKind: ProviderKind

  @column()
  declare model: string

  @column()
  declare status: EvalRunStatus

  @column()
  declare failureReason: EvalFailureReason | string | null

  @column(usd)
  declare capUsd: number

  @column(usd)
  declare estimateLowUsd: number | null

  @column(usd)
  declare estimateHighUsd: number | null

  @column()
  declare pricesCheckedOn: string

  @column(usd)
  declare costUsd: number | null

  @column()
  declare inputTokens: number

  @column()
  declare cachedInputTokens: number

  @column()
  declare cacheWriteTokens: number

  @column()
  declare outputTokens: number

  @column()
  declare trialCount: number

  @column()
  declare configRevision: number

  @column()
  declare catalogVersion: string

  @column.dateTime()
  declare startedAt: DateTime | null

  @column.dateTime()
  declare endedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => ConventionEvalTrial, { foreignKey: 'runId' })
  declare trials: HasMany<typeof ConventionEvalTrial>
}

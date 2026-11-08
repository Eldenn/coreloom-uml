import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { Target } from '#app/agent-configs/constants/agent-config'
import AgentConfigAnswer from '#app/agent-configs/models/agent-config-answer'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'

/** A catalog questionnaire a configuration uses, at the version it was answered against. */
export type AgentConfigQuestionnaire = { id: string; version: string }

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/**
 * Agent conventions: the project artifact AGENTS.md and its pointer files are rendered from,
 * one per project. Answers, accepted rules, notes and targets are the source of truth; the
 * files only exist in its generations.
 */
export default class AgentConfig extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  /** Always one of the owner's projects; a project has at most one configuration. */
  @column()
  declare projectId: number

  @column(json)
  declare questionnaires: AgentConfigQuestionnaire[]

  @column(json)
  declare targets: Target[]

  @column()
  declare notes: string | null

  /** Goes up on every change to answers, rules, notes, targets or questionnaires. */
  @column()
  declare revision: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>

  @hasMany(() => AgentConfigAnswer)
  declare answers: HasMany<typeof AgentConfigAnswer>

  @hasMany(() => AgentConfigRule)
  declare rules: HasMany<typeof AgentConfigRule>

  @hasMany(() => AgentConfigGeneration)
  declare generations: HasMany<typeof AgentConfigGeneration>
}

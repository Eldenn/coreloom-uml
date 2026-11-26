import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { Target } from '#app/agent-configs/constants/agent-config'
import AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import AgentConfigReadyRule from '#app/agent-configs/models/agent-config-ready-rule'
import AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/**
 * Agent conventions: what AGENTS.md and its pointer files are rendered from, in one of the
 * owner's projects (at most one per project) or outside any. Ready-made rules, the owner's own
 * rules, notes, roles and targets are the source of truth; the files only exist in its generations.
 */
export default class AgentConfig extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  /** One of the owner's projects, or null outside any; a project has at most one configuration. */
  @column()
  declare projectId: number | null

  @column()
  declare name: string

  @column(json)
  declare targets: Target[]

  @column()
  declare notes: string | null

  /** Goes up on every change to ready-made rules, rules, roles, skills, notes or targets. */
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

  @hasMany(() => AgentConfigReadyRule)
  declare readyRules: HasMany<typeof AgentConfigReadyRule>

  @hasMany(() => AgentConfigRule)
  declare rules: HasMany<typeof AgentConfigRule>

  @hasMany(() => AgentConfigRole)
  declare roles: HasMany<typeof AgentConfigRole>

  /** The skills its owner chose, which `pull` installs. */
  @hasMany(() => AgentConfigSkill)
  declare skills: HasMany<typeof AgentConfigSkill>

  @hasMany(() => AgentConfigGeneration)
  declare generations: HasMany<typeof AgentConfigGeneration>
}

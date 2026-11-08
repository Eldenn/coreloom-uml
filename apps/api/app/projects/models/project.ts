import { BaseModel, belongsTo, column, hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import AgentConfig from '#app/agent-configs/models/agent-config'
import Architecture from '#app/architectures/models/architecture'
import User from '#app/users/models/user'

/**
 * A project: the container of one piece of design work, owned by one user.
 * It holds the project's artifacts: architectures (sets of UML diagrams), and
 * at most one agent configuration. A new kind of artifact gets its own table
 * with a `project_id` and a relation here.
 */
export default class Project extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare name: string

  @column()
  declare description: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Architecture)
  declare architectures: HasMany<typeof Architecture>

  @hasOne(() => AgentConfig)
  declare agentConfig: HasOne<typeof AgentConfig>
}

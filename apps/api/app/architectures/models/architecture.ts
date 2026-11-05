import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import Diagram from '#app/diagrams/models/diagram'
import User from '#app/users/models/user'

/** A software architecture: a titled set of UML diagrams (its views), owned by one user. */
export default class Architecture extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare title: string

  @column()
  declare description: string | null

  @column()
  declare visibility: ArchitectureVisibility

  @column({ serializeAs: null })
  declare shareToken: string | null

  /** Encrypted with the `encryption` service; read through the sharing service only. */
  @column({ serializeAs: null })
  declare accessCode: string | null

  @column({ serializeAs: null })
  declare accessVersion: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Diagram)
  declare diagrams: HasMany<typeof Diagram>
}

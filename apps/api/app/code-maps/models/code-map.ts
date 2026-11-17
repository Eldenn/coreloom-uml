import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { CodeMapSource, CodeMapStatus } from '#app/code-maps/constants/code-map'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'

/**
 * The structure of a repository at one commit (files, symbols, the links between them), held by
 * one of its owner's projects. The row is the header; the map itself is a gzipped `CodeMap` in
 * Drive under `storageKey`.
 */
export default class CodeMap extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare projectId: number

  @column()
  declare userId: number

  @column()
  declare source: CodeMapSource

  @column()
  declare repositoryUrl: string | null

  @column()
  declare branch: string | null

  @column()
  declare commitSha: string | null

  @column()
  declare extractor: string

  @column()
  declare extractorVersion: string

  @column()
  declare status: CodeMapStatus

  @column()
  declare failureReason: string | null

  @column()
  declare nodeCount: number

  @column()
  declare edgeCount: number

  /** Null until the map is stored (an extraction still running, or one that failed). */
  @column({ serializeAs: null })
  declare storageKey: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Project)
  declare project: BelongsTo<typeof Project>
}

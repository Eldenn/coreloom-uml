import { BaseModel, column, manyToMany } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { SkillSourceKind } from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'

/** Where the weekly search looks for skills (see the `skill_sources` migration). */
export default class SkillSource extends BaseModel {
  static table = 'skill_sources'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare kind: SkillSourceKind

  @column()
  declare owner: string | null

  @column()
  declare repo: string | null

  @column()
  declare path: string | null

  @column()
  declare enabled: boolean

  @column.dateTime()
  declare lastRunAt: DateTime | null

  @column()
  declare lastError: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /** The skills it listed at its last run that answered. */
  @manyToMany(() => CatalogSkill, {
    pivotTable: 'skill_source_skills',
    pivotForeignKey: 'skill_source_id',
    pivotRelatedForeignKey: 'skill_id',
  })
  declare skills: ManyToMany<typeof CatalogSkill>
}

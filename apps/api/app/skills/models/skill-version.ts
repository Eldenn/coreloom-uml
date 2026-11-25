import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { DateTime } from 'luxon'
import type { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import type { SkillScan } from '#app/skills/services/skill-scans'

export type SkillVersionFile = { path: string; size: number; executable: boolean }

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** A copy of a skill's files at one commit (see the `skill_versions` migration). */
export default class SkillVersion extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare skillId: number

  @column()
  declare contentSha: string

  @column()
  declare repository: string

  @column()
  declare commit: string

  @column()
  declare folder: string

  @column()
  declare license: string

  @column(json)
  declare files: SkillVersionFile[]

  @column()
  declare bytes: number

  @column({ serializeAs: null })
  declare storageKey: string

  /** SkillSpector's verdict, null until scanned (see `skill-scans.ts`). */
  @column({ prepare: (value: unknown) => (value === null ? null : JSON.stringify(value)) })
  declare scan: SkillScan | null

  /** Why the admin approved it despite its scan (`canOverride`). */
  @column()
  declare overrideReason: string | null

  @column()
  declare status: SkillVersionStatus

  @column()
  declare reviewedBy: number | null

  @column.dateTime()
  declare reviewedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => CatalogSkill, { foreignKey: 'skillId' })
  declare skill: BelongsTo<typeof CatalogSkill>
}

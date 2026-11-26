import { BaseModel, column } from '@adonisjs/lucid/orm'
import {
  isTopic,
  type Skill,
  type SkillAffinity,
  type SkillOrigin,
  type SkillProvenance,
  type Target,
} from '@coreloom-uml/catalog'
import type { DateTime } from 'luxon'
import type { SkillStatus } from '#app/skills/constants/skill'

export type SkillAudit = SkillProvenance['audits'][number]

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** One skill of the catalog (see the `skills` migration). */
export default class CatalogSkill extends BaseModel {
  static table = 'skills'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare slug: string

  @column()
  declare name: string

  @column(json)
  declare description: Skill['description']

  @column()
  declare url: string

  @column(json)
  declare targets: Target[]

  @column(json)
  declare affinities: SkillAffinity[]

  /** What everything reads (`effectiveTopics`): the admin's, else the tagger's, else the search's. */
  @column(json)
  declare topics: string[]

  /** The tags of the search queries that found it (and the package's, for a hand-picked one). */
  @column(json)
  declare searchTopics: string[]

  /** The tags the tagger gave, null until it tagged this skill. */
  @column({ prepare: (value: unknown) => (value === null ? null : JSON.stringify(value)) })
  declare taggerTopics: string[] | null

  /** The tags the admin set, the first being the main one, which the tagger learns from. */
  @column({ prepare: (value: unknown) => (value === null ? null : JSON.stringify(value)) })
  declare reviewedTopics: string[] | null

  @column.dateTime()
  declare reviewedAt: DateTime | null

  @column()
  declare origin: SkillOrigin

  @column()
  declare status: SkillStatus

  @column()
  declare statusReason: string | null

  @column()
  declare eligible: boolean

  @column()
  declare ineligibleReason: string | null

  @column()
  declare registryId: string | null

  @column()
  declare source: string | null

  @column()
  declare installs: number | null

  @column(json)
  declare audits: SkillAudit[]

  @column()
  declare license: string | null

  @column()
  declare contentSha: string | null

  @column.dateTime()
  declare firstSeenAt: DateTime | null

  @column.dateTime()
  declare lastSeenAt: DateTime | null

  @column.dateTime()
  declare checkedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /** The entry as `@coreloom-uml/catalog` reads it; a found one needs its checks first. */
  toSkill(): Skill {
    const provenance: SkillProvenance | undefined =
      this.registryId && this.installs !== null && this.contentSha && this.checkedAt
        ? {
            // Audited on skills.sh, or vouched for by a trusted GitHub source alone.
            registry: this.audits.length > 0 ? 'skills.sh' : 'github',
            id: this.registryId,
            installs: this.installs,
            audits: this.audits,
            checkedOn: this.checkedAt.toISODate() ?? '',
            contentSha: this.contentSha,
          }
        : undefined
    return {
      id: this.slug,
      name: this.name,
      description: this.description,
      url: this.url,
      targets: this.targets,
      affinities: this.affinities,
      topics: this.topics.filter(isTopic),
      origin: this.origin,
      ...(provenance ? { provenance } : {}),
    }
  }
}

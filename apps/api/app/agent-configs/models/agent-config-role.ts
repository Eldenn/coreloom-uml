import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { Right, Role } from '@coreloom-uml/catalog'
import type { DateTime } from 'luxon'

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/** A role of a configuration: one framed coding agent, rendered for every target that runs it. */
export default class AgentConfigRole extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentConfigId: number

  /** Unique within its configuration. */
  @column()
  declare slug: string

  @column()
  declare name: string

  @column()
  declare description: string

  @column()
  declare mission: string

  @column(json)
  declare rights: Right[]

  @column(json)
  declare scope: string[]

  @column(json)
  declare forbidden: string[]

  @column(json)
  declare done: Role['done']

  @column()
  declare escalation: string | null

  @column(json)
  declare source: Role['source']

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /** The catalog's role, without the row's id and dates. */
  toRole(): Role {
    return {
      slug: this.slug,
      name: this.name,
      description: this.description,
      mission: this.mission,
      rights: this.rights,
      scope: this.scope,
      forbidden: this.forbidden,
      done: this.done,
      escalation: this.escalation,
      source: this.source,
    }
  }
}

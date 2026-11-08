import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { AgentContextFile, Recommendation, SkillSuggestions } from '@coreloom-uml/catalog'
import type { DateTime } from 'luxon'
import type { AgentConfigInputs } from '#app/agent-configs/services/agent-context'

/**
 * Skill suggestions of a generation, copied from the catalog when it was rendered. Generations
 * made before the skills catalog existed hold two empty lists.
 */
export type AgentGenerationSkills = SkillSuggestions

const json = { prepare: (value: unknown) => JSON.stringify(value) }

/**
 * A frozen render of one revision of a configuration: never edited, only replaced by a newer
 * one. `inputs` is what it was rendered from, so the render can be replayed.
 */
export default class AgentConfigGeneration extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare agentConfigId: number

  @column()
  declare revision: number

  /** The `@coreloom-uml/catalog` version whose questionnaires and templates rendered it. */
  @column()
  declare catalogVersion: string

  @column(json)
  declare inputs: AgentConfigInputs

  @column(json)
  declare files: AgentContextFile[]

  @column(json)
  declare recommendations: Recommendation[]

  @column(json)
  declare skills: AgentGenerationSkills

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

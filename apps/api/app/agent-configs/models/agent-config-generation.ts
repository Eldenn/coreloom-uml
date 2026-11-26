import { BaseModel, column } from '@adonisjs/lucid/orm'
import type {
  AgentContextFile,
  AgentContextRole,
  Recommendation,
  SkillSuggestions,
} from '@coreloom-uml/catalog'
import type { DateTime } from 'luxon'
import type { StoredAgentConfigInputs } from '#app/agent-configs/services/agent-context'

/**
 * Skill suggestions of a generation, copied from the catalog when it was rendered, and `held`, the
 * slugs of the skills the configuration held then, which `pull` installs. `copies` names, for each
 * held skill whose copy was served then, that copy (`skill_versions.id`, never rewritten): the files
 * the generation shows. Generations made before the skills catalog existed hold two empty lists,
 * those made before held skills no `held`, those made before their files no `copies`.
 */
export type AgentGenerationSkills = SkillSuggestions & {
  held?: string[]
  copies?: { slug: string; versionId: number }[]
}

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

  /** The `@coreloom-uml/catalog` version whose rule packs and templates rendered it. */
  @column()
  declare catalogVersion: string

  @column(json)
  declare inputs: StoredAgentConfigInputs

  @column(json)
  declare files: AgentContextFile[]

  @column(json)
  declare recommendations: Recommendation[]

  @column(json)
  declare skills: AgentGenerationSkills

  /** What each target does with each role; generations made before roles hold none. */
  @column(json)
  declare roles: AgentContextRole[]

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

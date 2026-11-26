import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'

/** The files of the binary's folder, by name (see `CLAUDE_STATE_FILES`). */
export type ClaudeStateFiles = Record<string, string>

/** A connected Claude subscription (see the `claude_code_states` migration). */
export default class ClaudeCodeState extends BaseModel {
  static table = 'claude_code_states'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  /**
   * The files as one JSON object, sealed by `llmKeys` and bound to their owner
   * (`llm-secrets.ts`); only `claude-code-state.ts` seals or opens them. Never serialized.
   */
  @column({ columnName: 'files', serializeAs: null })
  declare sealedFiles: string

  /** Raised by every write (see the migration). */
  @column()
  declare version: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

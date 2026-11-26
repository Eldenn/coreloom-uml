import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { DateTime } from 'luxon'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'

/** The files of the binary's folder, by name (see `CLAUDE_STATE_FILES`). */
export type ClaudeStateFiles = Record<string, string>

/**
 * Sealed by the dedicated `llmKeys` encrypter as one JSON object; `null` on read when it cannot
 * be decrypted or parsed (a key changed), which the services treat as "not connected". Never
 * serialized.
 */
/** The sealed text of a state, as the `files` column stores it. */
export function sealClaudeFiles(files: ClaudeStateFiles): string {
  return sealLlmSecret(JSON.stringify(files), LlmSecretPurpose.ClaudeState)
}

const sealed = {
  prepare: sealClaudeFiles,
  consume: (value: string): ClaudeStateFiles | null => {
    const plain = openLlmSecret(value, LlmSecretPurpose.ClaudeState)
    if (plain === null) return null
    try {
      const files = JSON.parse(plain) as unknown
      if (!files || typeof files !== 'object' || Array.isArray(files)) return null
      const values = Object.values(files)
      return values.every((value) => typeof value === 'string') ? (files as ClaudeStateFiles) : null
    } catch {
      return null
    }
  },
  serializeAs: null,
}

/** A connected Claude subscription (see the `claude_code_states` migration). */
export default class ClaudeCodeState extends BaseModel {
  static table = 'claude_code_states'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column(sealed)
  declare files: ClaudeStateFiles | null

  /** Raised by every write (see the migration). */
  @column()
  declare version: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}

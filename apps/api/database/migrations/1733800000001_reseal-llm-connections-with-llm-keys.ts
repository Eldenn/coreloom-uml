import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import {
  openLegacyAppSecret,
  openLlmSecret,
  sealLlmSecret,
} from '#app/llm-connections/services/llm-secrets'

const COLUMNS = ['access_token', 'refresh_token'] as const

/**
 * The ChatGPT tokens of `llm_connections` move from `APP_KEY` to the dedicated `llmKeys`
 * encrypter, like every other stored LLM secret. Each value is read with either and sealed again;
 * a value neither can read (a key changed) is left as it is, and the service already treats such
 * a row as "not connected". Nothing is logged but counts.
 */
export default class extends BaseSchema {
  protected tableName = 'llm_connections'

  async up() {
    this.defer((db) =>
      this.reseal(db, 'llmKeys', (sealed) => {
        if (openLlmSecret(sealed, LlmSecretPurpose.Connection) !== null) return null
        const plain = openLegacyAppSecret(sealed)
        return plain === null ? null : sealLlmSecret(plain, LlmSecretPurpose.Connection)
      }),
    )
  }

  /** Back to `APP_KEY`, which is all the code before this migration can read. */
  async down() {
    this.defer((db) =>
      this.reseal(db, 'APP_KEY', (sealed) => {
        const plain = openLlmSecret(sealed, LlmSecretPurpose.Connection)
        return plain === null ? null : encryption.encrypt(plain)
      }),
    )
  }

  private async reseal(
    db: Parameters<Parameters<BaseSchema['defer']>[0]>[0],
    target: string,
    resealed: (sealed: string) => string | null,
  ) {
    const rows = await db.from(this.tableName).select('id', ...COLUMNS)
    let moved = 0
    for (const row of rows) {
      const update: Record<string, string> = {}
      for (const column of COLUMNS) {
        const next = resealed(row[column] as string)
        if (next !== null) update[column] = next
      }
      if (Object.keys(update).length === 0) continue
      await db.from(this.tableName).where('id', row.id).update(update)
      moved++
    }
    console.info(`llm_connections: ${moved} of ${rows.length} row(s) sealed with ${target}`)
  }
}

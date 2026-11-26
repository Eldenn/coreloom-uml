import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'

const COLUMNS = ['access_token', 'refresh_token'] as const

type Row = { id: number; user_id: number } & Record<(typeof COLUMNS)[number], string>

/**
 * The ChatGPT tokens of `llm_connections` move from `APP_KEY` to the dedicated `llmKeys`
 * encrypter, bound to their owner like every other stored LLM secret. The code no longer reads an
 * `APP_KEY` token: this migration is the only reader left. A value already moved is left as it
 * is, and so is one neither key can read (the service deletes such a row as "not connected").
 * Nothing is logged but counts.
 */
export default class extends BaseSchema {
  protected tableName = 'llm_connections'

  async up() {
    this.defer((db) =>
      this.reseal(db, 'llmKeys', (sealed, owner) => {
        if (openLlmSecret(sealed, LlmSecretPurpose.Connection, owner) !== null) return null
        const plain = encryption.decrypt<string>(sealed) ?? null
        return plain === null ? null : sealLlmSecret(plain, LlmSecretPurpose.Connection, owner)
      }),
    )
  }

  /** Back to `APP_KEY`, which is all the code before this migration can read. */
  async down() {
    this.defer((db) =>
      this.reseal(db, 'APP_KEY', (sealed, owner) => {
        const plain = openLlmSecret(sealed, LlmSecretPurpose.Connection, owner)
        return plain === null ? null : encryption.encrypt(plain)
      }),
    )
  }

  private async reseal(
    db: Parameters<Parameters<BaseSchema['defer']>[0]>[0],
    target: string,
    resealed: (sealed: string, owner: { id: number }) => string | null,
  ) {
    const rows: Row[] = await db.from(this.tableName).select('id', 'user_id', ...COLUMNS)
    let moved = 0
    for (const row of rows) {
      const update: Record<string, string> = {}
      for (const column of COLUMNS) {
        const next = resealed(row[column], { id: row.user_id })
        if (next !== null) update[column] = next
      }
      if (Object.keys(update).length === 0) continue
      await db.from(this.tableName).where('id', row.id).update(update)
      moved++
    }
    console.info(`llm_connections: ${moved} of ${rows.length} row(s) sealed with ${target}`)
  }
}

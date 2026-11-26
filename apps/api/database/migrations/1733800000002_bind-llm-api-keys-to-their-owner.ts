import encryption from '@adonisjs/core/services/encryption'
import { BaseSchema } from '@adonisjs/lucid/schema'
import { LlmSecretPurpose } from '#app/llm-connections/constants/llm-connections'
import { openLlmSecret, sealLlmSecret } from '#app/llm-connections/services/llm-secrets'

type Row = { id: number; user_id: number; api_key: string }

/**
 * The saved keys of `llm_api_keys` were sealed by `llmKeys` for their kind only: they are sealed
 * again bound to their owner too, so a key copied to another account's row never decrypts there.
 * The code no longer reads a key sealed the old way: this migration is the only reader left. A
 * key already moved is left as it is, and so is one that cannot be read (the service reads it as
 * "no key saved"). Nothing is logged but counts.
 */
export default class extends BaseSchema {
  protected tableName = 'llm_api_keys'

  async up() {
    this.defer((db) =>
      this.reseal(db, 'their owner', (sealed, owner) => {
        if (openLlmSecret(sealed, LlmSecretPurpose.ApiKey, owner) !== null) return null
        const plain = encryption.use('llmKeys').decrypt<string>(sealed, LlmSecretPurpose.ApiKey)
        return plain ? sealLlmSecret(plain, LlmSecretPurpose.ApiKey, owner) : null
      }),
    )
  }

  /** Back to the kind alone, which is all the code before this migration can read. */
  async down() {
    this.defer((db) =>
      this.reseal(db, 'their kind only', (sealed, owner) => {
        const plain = openLlmSecret(sealed, LlmSecretPurpose.ApiKey, owner)
        return plain === null
          ? null
          : encryption.use('llmKeys').encrypt(plain, { purpose: LlmSecretPurpose.ApiKey })
      }),
    )
  }

  private async reseal(
    db: Parameters<Parameters<BaseSchema['defer']>[0]>[0],
    target: string,
    resealed: (sealed: string, owner: { id: number }) => string | null,
  ) {
    const rows: Row[] = await db
      .from(this.tableName)
      .whereNotNull('api_key')
      .select('id', 'user_id', 'api_key')
    let moved = 0
    for (const row of rows) {
      const next = resealed(row.api_key, { id: row.user_id })
      if (next === null) continue
      await db.from(this.tableName).where('id', row.id).update({ api_key: next })
      moved++
    }
    console.info(`llm_api_keys: ${moved} of ${rows.length} key(s) sealed for ${target}`)
  }
}

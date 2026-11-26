import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The provider API keys an account saved, one row per kind. The key is encrypted with the
 * dedicated `llmKeys` encrypter (`LLM_KEYS_ENCRYPTION_KEYS`), never `APP_KEY`; `key_hint` is the
 * last four characters in plain text so the settings screen can show `…abcd`. `base_url` is the
 * origin the key was saved with: a call's base URL comes from this row, never from the request.
 * `verified_at` is the date of the successful test call that stored the key.
 */
export default class extends BaseSchema {
  protected tableName = 'llm_api_keys'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      // Only the kinds that authenticate with a key (see PROVIDER_KINDS in @coreloom-uml/catalog).
      table.string('kind', 50).notNullable()
      // `null` for a kind that calls a server without one, whose row then holds its origin.
      table.text('api_key').nullable()
      table.string('key_hint', 8).notNullable()
      table.string('base_url', 2000).nullable()
      table.timestamp('verified_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.unique(['user_id', 'kind'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

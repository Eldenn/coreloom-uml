import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The web search service the admin saved for the whole instance: at most one row, since a save
 * deletes every other one. The key is sealed by the dedicated `llmKeys` encrypter, bound to the
 * instance (`INSTANCE_OWNER`); `key_hint` is its last four characters in plain text. `verified_at`
 * is the date of the successful check that stored it.
 */
export default class extends BaseSchema {
  protected tableName = 'web_search_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.text('kind').notNullable().unique()
      table.text('sealed_key').notNullable()
      table.string('key_hint', 4).notNullable()
      table.timestamp('verified_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

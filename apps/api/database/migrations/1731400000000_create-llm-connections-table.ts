import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A subscription an account connected to call its own model (`openai-codex` today: the ChatGPT
 * tokens). Tokens are encrypted with `APP_KEY` before they reach this table. A Claude
 * subscription has no row: only the `claude` binary holds its credentials.
 */
export default class extends BaseSchema {
  protected tableName = 'llm_connections'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('kind', 50).notNullable()
      table.text('access_token').notNullable()
      table.text('refresh_token').notNullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.string('account_id', 200).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.unique(['user_id', 'kind'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

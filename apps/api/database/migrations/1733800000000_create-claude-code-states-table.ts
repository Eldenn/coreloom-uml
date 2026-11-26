import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A connected Claude subscription, held in the database rather than on a disk: the files the
 * `claude` binary keeps in its configuration folder (its credentials and its settings, see
 * `CLAUDE_STATE_FILES`), as one JSON object encrypted with the dedicated `llmKeys` encrypter.
 * A launch of the binary gets them in a short-lived private folder and they are written back
 * when it ends, since the binary refreshes its own tokens. One row per account.
 *
 * `down` drops every saved subscription, and `claude:import` has removed the folders they came
 * from: rolling back signs every account out of Claude.
 */
export default class extends BaseSchema {
  protected tableName = 'claude_code_states'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .notNullable()
        .unique()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.text('files').notNullable()
      // Raised by every write: a launch writes its files back only over the version it read, so
      // one whose lock ran out never overwrites a newer state, and a deleted row stays deleted.
      table.integer('version').notNullable().defaultTo(1)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

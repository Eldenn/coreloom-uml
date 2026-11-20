import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A file attached to an assistant conversation: its name, its length and the summary of each part
 * (`parts`). Its text is a gzipped object in Drive (`storage_key`), never a column: deleting the
 * conversation or the account deletes the object too, since the cascade cannot reach it.
 */
export default class extends BaseSchema {
  protected tableName = 'assistant_files'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .notNullable()
        .references('id')
        .inTable('assistant_conversations')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('name', 255).notNullable()
      table.integer('chars').notNullable()
      table.string('storage_key', 255).notNullable()
      table.jsonb('parts').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.index(['conversation_id', 'id'])
      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

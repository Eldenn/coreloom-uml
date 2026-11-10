import { BaseSchema } from '@adonisjs/lucid/schema'

/** One turn of an assistant conversation; `changes` holds the diagram changes it proposed. */
export default class extends BaseSchema {
  protected tableName = 'assistant_messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('assistant_conversations')
        .onDelete('CASCADE')
      table.string('role', 20).notNullable()
      table.text('content').notNullable()
      table.jsonb('changes').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.index(['conversation_id', 'id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

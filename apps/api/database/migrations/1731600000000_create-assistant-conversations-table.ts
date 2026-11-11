import { BaseSchema } from '@adonisjs/lucid/schema'

/** A chat the workspace assistant holds about one architecture, for its owner. */
export default class extends BaseSchema {
  protected tableName = 'assistant_conversations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('architecture_id')
        .notNullable()
        .references('id')
        .inTable('architectures')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('title', 200).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['architecture_id', 'updated_at'])
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

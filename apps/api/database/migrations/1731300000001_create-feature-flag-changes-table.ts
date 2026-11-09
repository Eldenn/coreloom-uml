import { BaseSchema } from '@adonisjs/lucid/schema'

/** One line per change of a flag's state: who, when, what (shown in the admin screen). */
export default class extends BaseSchema {
  protected tableName = 'feature_flag_changes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('flag_key', 100).notNullable().index()
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('text', 500).notNullable()
      table.timestamp('created_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agent conventions: a project artifact, one per project. It names the catalog questionnaires
 * it uses (each at the version it was answered against) and the coding tools it renders for.
 * `revision` goes up on every change to what the files are rendered from.
 */
export default class extends BaseSchema {
  protected tableName = 'agent_configs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.index('user_id')
      table
        .integer('project_id')
        .notNullable()
        .unique()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      // `{ id, version }[]`, checked by the app against `@coreloom-uml/catalog`.
      table.jsonb('questionnaires').notNullable()
      // `Target[]`, checked by the app.
      table.jsonb('targets').notNullable()
      table.text('notes').nullable()
      table.integer('revision').notNullable().defaultTo(1)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

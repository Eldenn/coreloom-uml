import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Conformance reviews: diagrams of a project checked against one of its code maps by the owner's
 * own model, one call per diagram. `diagrams` holds where each one stands. The repository and the
 * revision are copied from the map, so evidence links outlive it.
 */
export default class extends BaseSchema {
  protected tableName = 'code_reviews'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('project_id')
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table
        .integer('code_map_id')
        .nullable()
        .references('id')
        .inTable('code_maps')
        .onDelete('SET NULL')
      table.string('repository_url', 1024).nullable()
      table.string('branch', 200).nullable()
      table.string('commit_sha', 64).nullable()
      table.string('provider_kind', 40).nullable()
      table.string('model', 200).nullable()
      table.boolean('include_snippets').notNullable().defaultTo(false)
      table.string('locale', 8).notNullable()
      table.jsonb('diagrams').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['project_id', 'created_at'])
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

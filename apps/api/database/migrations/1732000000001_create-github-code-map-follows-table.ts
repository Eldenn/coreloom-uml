import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A project that follows a GitHub repository: each push on its branch reads the repository into
 * a new code map. At most one per project; it works only while its owner still has a grant on the
 * repository (`github_repository_grants`).
 */
export default class extends BaseSchema {
  protected tableName = 'github_code_map_follows'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('project_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.bigInteger('repository_id').notNullable().index()
      table.string('repository_url', 1024).notNullable()
      /** Null: the repository's default branch. */
      table.string('branch', 200).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

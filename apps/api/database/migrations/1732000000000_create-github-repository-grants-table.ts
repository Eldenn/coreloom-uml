import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The GitHub repositories a user can read through the GitHub App, as GitHub listed them when the
 * user last connected (`POST /github/connection`). The server reads only these, with a token made
 * for one clone; webhooks delete the rows of an uninstalled App or a removed repository. No token
 * is stored here.
 */
export default class extends BaseSchema {
  protected tableName = 'github_repository_grants'

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
      table.bigInteger('github_user_id').notNullable()
      table.string('github_login', 39).notNullable()
      table.bigInteger('installation_id').notNullable()
      table.bigInteger('repository_id').notNullable()
      table.string('owner', 39).notNullable()
      table.string('name', 100).notNullable()
      table.boolean('private').notNullable()
      table.string('default_branch', 200).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.unique(['user_id', 'repository_id'])
      table.index(['installation_id'])
      table.index(['repository_id'])
      table.index(['github_user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The GitHub App the admin created from the settings (GitHub's manifest flow), when the
 * environment sets none. One row at most. `credentials` holds the App's client secret, private
 * key and webhook secret, encrypted with APP_KEY: never returned by the API, never logged.
 */
export default class extends BaseSchema {
  protected tableName = 'github_app_registrations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.bigInteger('app_id').notNullable().unique()
      table.string('slug', 100).notNullable()
      table.string('name', 100).notNullable()
      table.string('client_id', 100).notNullable()
      table.string('owner_login', 39).notNullable()
      table.string('owner_type', 20).notNullable()
      table.text('credentials').notNullable()
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

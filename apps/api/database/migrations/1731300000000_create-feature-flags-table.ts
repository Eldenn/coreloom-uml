import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The state of each feature flag the admin changed, by key. A declared flag with no row reads as
 * its default state (`@coreloom-uml/feature-flags`); a row whose key is no longer declared is
 * ignored.
 */
export default class extends BaseSchema {
  protected tableName = 'feature_flags'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('key', 100).primary()
      table.jsonb('state').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

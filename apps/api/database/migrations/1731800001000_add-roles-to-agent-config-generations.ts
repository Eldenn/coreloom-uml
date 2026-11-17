import { BaseSchema } from '@adonisjs/lucid/schema'

/** What each tool does with each role of a generation; generations made before roles hold none. */
export default class extends BaseSchema {
  protected tableName = 'agent_config_generations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('roles').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('roles')
    })
  }
}

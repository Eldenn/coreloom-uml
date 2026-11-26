import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The skills a configuration holds, chosen by its owner among those with an approved copy:
 * `pull` installs each one's newest approved copy. A skill leaves with its configuration or its row.
 */
export default class extends BaseSchema {
  protected tableName = 'agent_config_skills'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.integer('skill_id').notNullable().references('id').inTable('skills').onDelete('CASCADE')
      table.index('skill_id')
      table.timestamp('created_at').notNullable()
      table.unique(['agent_config_id', 'skill_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

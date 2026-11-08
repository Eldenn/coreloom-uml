import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Generations: an immutable, dated render of one revision of a configuration. `inputs` is the
 * full snapshot it was rendered from (answers, rules, notes, targets, project context), so the
 * render can be replayed to tell what a change would alter (`impact`).
 */
export default class extends BaseSchema {
  protected tableName = 'agent_config_generations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.index(['agent_config_id', 'id'])
      table.integer('revision').notNullable()
      table.string('catalog_version', 32).notNullable()
      table.jsonb('inputs').notNullable()
      // `{ path, kind, content, blockHash }[]`
      table.jsonb('files').notNullable()
      table.jsonb('recommendations').notNullable()
      table.jsonb('skills').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  ROLE_SLUG_MAX_LENGTH,
} from '@coreloom-uml/catalog'

/** Roles: framed agents of a configuration, one slug each, rendered per tool in its generations. */
export default class extends BaseSchema {
  protected tableName = 'agent_config_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.index('agent_config_id')
      table.string('slug', ROLE_SLUG_MAX_LENGTH).notNullable()
      table.string('name', ROLE_NAME_MAX_LENGTH).notNullable()
      table.string('description', ROLE_DESCRIPTION_MAX_LENGTH).notNullable()
      table.text('mission').notNullable()
      table.jsonb('rights').notNullable()
      table.jsonb('scope').notNullable()
      table.jsonb('forbidden').notNullable()
      table.jsonb('done').notNullable()
      table.text('escalation').nullable()
      table.jsonb('source').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.unique(['agent_config_id', 'slug'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

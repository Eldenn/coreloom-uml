import { BaseSchema } from '@adonisjs/lucid/schema'
import { SUGGESTED_DIAGRAM_KINDS } from '@coreloom-uml/llm'
import {
  CODE_MAP_SUGGESTION_LIMITS,
  CODE_MAP_SUGGESTION_STATUSES,
} from '#app/code-maps/constants/code-map'

/**
 * The diagrams the owner's model proposed for a code map, each with the part of the code it
 * covers, and what the owner did with it. `code_maps.suggested_at` says when the list was made,
 * so the browser asks for it once per map.
 */
export default class extends BaseSchema {
  protected tableName = 'code_map_suggestions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('code_map_id')
        .notNullable()
        .references('id')
        .inTable('code_maps')
        .onDelete('CASCADE')
      table.enum('kind', SUGGESTED_DIAGRAM_KINDS).notNullable()
      table.string('title', CODE_MAP_SUGGESTION_LIMITS.title).notNullable()
      table.text('reason').notNullable()
      table.jsonb('focus').notNullable()
      table.enum('status', CODE_MAP_SUGGESTION_STATUSES).notNullable().defaultTo('open')
      table.integer('position').notNullable()
      table
        .integer('architecture_id')
        .nullable()
        .references('id')
        .inTable('architectures')
        .onDelete('SET NULL')
      table
        .integer('conversation_id')
        .nullable()
        .references('id')
        .inTable('assistant_conversations')
        .onDelete('SET NULL')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['code_map_id', 'position'])
    })
    this.schema.alterTable('code_maps', (table) => {
      table.timestamp('suggested_at', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.alterTable('code_maps', (table) => {
      table.dropColumn('suggested_at')
    })
    this.schema.dropTable(this.tableName)
  }
}

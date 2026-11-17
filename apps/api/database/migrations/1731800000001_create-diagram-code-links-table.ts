import { BaseSchema } from '@adonisjs/lucid/schema'
import { DIAGRAM_CODE_LINK_STATUSES } from '#app/code-maps/constants/code-map'

/**
 * What the owner decided about a diagram element and a place in the code. Keyed by the code
 * key, not by a map, so a decision outlives the map it was made on.
 */
export default class extends BaseSchema {
  protected tableName = 'diagram_code_links'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('diagram_id')
        .notNullable()
        .references('id')
        .inTable('diagrams')
        .onDelete('CASCADE')
      table.string('element_id', 200).notNullable()
      table.string('code_key', 1300).notNullable()
      table.enum('status', DIAGRAM_CODE_LINK_STATUSES).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.unique(['diagram_id', 'element_id', 'code_key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

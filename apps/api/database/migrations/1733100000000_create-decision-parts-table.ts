import { BaseSchema } from '@adonisjs/lucid/schema'
import { POINTED_LABEL_MAX_LENGTH, POINTED_TYPES } from '#app/assistant/constants/assistant'

/**
 * The parts of views a decision names (an element, a relation, a member, a step), each by its
 * view and the one line that names it there, as the assistant's `pointed` parts are: never by a
 * position. A part goes with its decision and with its view.
 */
export default class extends BaseSchema {
  protected tableName = 'decision_parts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('decision_id')
        .notNullable()
        .references('id')
        .inTable('decisions')
        .onDelete('CASCADE')
      table
        .integer('diagram_id')
        .notNullable()
        .references('id')
        .inTable('diagrams')
        .onDelete('CASCADE')
      table.enum('type', POINTED_TYPES).notNullable()
      table.string('label', POINTED_LABEL_MAX_LENGTH).notNullable()
      table.unique(['decision_id', 'diagram_id', 'type', 'label'])
      table.index('diagram_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

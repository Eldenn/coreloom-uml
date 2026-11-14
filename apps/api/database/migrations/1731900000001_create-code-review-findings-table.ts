import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  CODE_REVIEW_RESOLUTIONS,
  CONFORMANCE_SEVERITIES,
  CONFORMANCE_STATUSES,
} from '#app/code-reviews/constants/code-review'

/**
 * What a review found about one diagram: an element (or the diagram as a whole), a status, a
 * comment and the places in the code it cites. The owner's resolution lives here.
 */
export default class extends BaseSchema {
  protected tableName = 'code_review_findings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('code_review_id')
        .notNullable()
        .references('id')
        .inTable('code_reviews')
        .onDelete('CASCADE')
      table
        .integer('diagram_id')
        .notNullable()
        .references('id')
        .inTable('diagrams')
        .onDelete('CASCADE')
      table.string('element_id', 200).nullable()
      table.enum('status', CONFORMANCE_STATUSES).notNullable()
      table.enum('severity', CONFORMANCE_SEVERITIES).notNullable()
      table.text('comment').notNullable()
      table.jsonb('evidence').notNullable()
      table.enum('resolution', CODE_REVIEW_RESOLUTIONS).notNullable().defaultTo('open')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['code_review_id', 'diagram_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

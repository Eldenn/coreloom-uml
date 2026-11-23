import { BaseSchema } from '@adonisjs/lucid/schema'
import { DECISION_STATUSES } from '#app/decisions/constants/decision'

/**
 * Architecture decisions of a project: the question, the options weighed, the one chosen and
 * what it costs. A decision names the requirements it serves and the diagrams it shapes; a link
 * goes with whichever side is deleted.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('decisions', (table) => {
      table.increments('id')
      table
        .integer('project_id')
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('title', 160).notNullable()
      table.text('context').nullable()
      table.jsonb('options').notNullable()
      table.string('chosen', 120).nullable()
      table.text('consequences').nullable()
      table.enum('status', DECISION_STATUSES).notNullable()
      table
        .integer('superseded_by_id')
        .nullable()
        .references('id')
        .inTable('decisions')
        .onDelete('SET NULL')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index('project_id')
      table.index('user_id')
    })

    this.schema.createTable('decision_requirements', (table) => {
      table
        .integer('decision_id')
        .notNullable()
        .references('id')
        .inTable('decisions')
        .onDelete('CASCADE')
      table
        .integer('requirement_id')
        .notNullable()
        .references('id')
        .inTable('requirements')
        .onDelete('CASCADE')
      table.primary(['decision_id', 'requirement_id'])
      table.index('requirement_id')
    })

    this.schema.createTable('decision_diagrams', (table) => {
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
      table.primary(['decision_id', 'diagram_id'])
      table.index('diagram_id')
    })
  }

  async down() {
    this.schema.dropTable('decision_diagrams')
    this.schema.dropTable('decision_requirements')
    this.schema.dropTable('decisions')
  }
}

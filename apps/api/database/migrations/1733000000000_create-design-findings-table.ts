import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  CODE_REVIEW_RESOLUTIONS,
  CONFORMANCE_SEVERITIES,
  CodeReviewResolution,
} from '#app/code-reviews/constants/code-review'

/**
 * What the owner's model found when it read an architecture's views against the requirements and
 * decisions of its project, and what the owner did with each finding. A finding outlives the
 * requirement, the decision or the view it names (the link is emptied), and goes with its
 * architecture.
 */
export default class extends BaseSchema {
  protected tableName = 'design_findings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('project_id')
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table
        .integer('architecture_id')
        .notNullable()
        .references('id')
        .inTable('architectures')
        .onDelete('CASCADE')
      table
        .integer('requirement_id')
        .nullable()
        .references('id')
        .inTable('requirements')
        .onDelete('SET NULL')
      table
        .integer('decision_id')
        .nullable()
        .references('id')
        .inTable('decisions')
        .onDelete('SET NULL')
      table
        .integer('diagram_id')
        .nullable()
        .references('id')
        .inTable('diagrams')
        .onDelete('SET NULL')
      table.enum('severity', CONFORMANCE_SEVERITIES).notNullable()
      table.text('comment').notNullable()
      table
        .enum('resolution', CODE_REVIEW_RESOLUTIONS)
        .notNullable()
        .defaultTo(CodeReviewResolution.Open)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index('project_id')
      table.index('architecture_id')
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

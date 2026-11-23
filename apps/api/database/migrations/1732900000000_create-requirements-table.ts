import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_PRIORITIES,
} from '#app/requirements/constants/requirement'

/**
 * What a project's architecture has to hold: one checkable sentence per row, with the quality it
 * is about and, when there is one, the measure that says it is met.
 */
export default class extends BaseSchema {
  protected tableName = 'requirements'

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
      table.enum('category', REQUIREMENT_CATEGORIES).notNullable()
      table.enum('priority', REQUIREMENT_PRIORITIES).notNullable()
      table.text('statement').notNullable()
      table.text('measure').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index('project_id')
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

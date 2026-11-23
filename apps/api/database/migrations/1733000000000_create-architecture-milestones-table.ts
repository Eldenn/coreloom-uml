import { BaseSchema } from '@adonisjs/lucid/schema'
import { MILESTONE_NAME_MAX_LENGTH } from '#app/milestones/constants/milestone'

/**
 * A named state of an architecture: all its views as they were when the owner kept it. Never
 * changed afterwards; deleted with its architecture.
 */
export default class extends BaseSchema {
  protected tableName = 'architecture_milestones'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('architecture_id')
        .notNullable()
        .references('id')
        .inTable('architectures')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('name', MILESTONE_NAME_MAX_LENGTH).notNullable()
      // The views kept (`MilestoneDiagram[]`), in display order; lists read `diagram_count` instead.
      table.jsonb('diagrams').notNullable()
      table.integer('diagram_count').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.index(['architecture_id', 'created_at'])
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

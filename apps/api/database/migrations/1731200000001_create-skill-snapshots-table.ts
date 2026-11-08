import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per skill and per search run that returned it: the registry's figures at that time,
 * never updated, so the catalog's history (installs over time, audits, eligibility) can be
 * charted and analysed.
 */
export default class extends BaseSchema {
  protected tableName = 'skill_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('skill_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('skills')
        .onDelete('CASCADE')
      // The run's time, shared by every snapshot it takes.
      table.timestamp('taken_at').notNullable()
      table.integer('installs').notNullable()
      table.jsonb('audits').notNullable()
      table.boolean('eligible').notNullable()
      table.string('ineligible_reason', 300).nullable()
      table.unique(['skill_id', 'taken_at'])
      table.index(['taken_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

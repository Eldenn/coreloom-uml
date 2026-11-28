import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The convention tests' settings the admin saved for the whole instance: at most one row (its id
 * is always 1). Without a row the cap is `CONVENTION_EVAL_LIMITS.capUsd`.
 */
export default class extends BaseSchema {
  protected tableName = 'convention_eval_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('id').primary()
      table.decimal('cap_usd', 10, 4).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

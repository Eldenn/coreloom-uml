import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One trial of a convention test: a task (and the rule it grades) in a condition, its attempt,
 * the two verdicts with their reasons, the tokens and cost it used, how long it took and its
 * output, filtered for secrets and capped. A trial whose output held a secret keeps no output at
 * all (`error_reason` = `leaked`).
 */
export default class extends BaseSchema {
  protected tableName = 'convention_eval_trials'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('run_id')
        .notNullable()
        .references('id')
        .inTable('convention_eval_runs')
        .onDelete('CASCADE')
      table.string('task_id', 100).notNullable()
      table.string('rule_slot', 100).notNullable()
      table.string('rule_id', 100).notNullable()
      table.string('condition', 16).notNullable()
      table.integer('attempt').notNullable()
      table.string('success_verdict', 16).nullable()
      table.text('success_reason').nullable()
      table.string('compliance_verdict', 16).nullable()
      table.text('compliance_reason').nullable()
      table.string('error_reason', 64).nullable()
      table.integer('input_tokens').notNullable().defaultTo(0)
      table.integer('cached_input_tokens').notNullable().defaultTo(0)
      table.integer('cache_write_tokens').notNullable().defaultTo(0)
      table.integer('output_tokens').notNullable().defaultTo(0)
      table.decimal('cost_usd', 10, 4).nullable()
      table.integer('duration_ms').notNullable().defaultTo(0)
      table.text('output').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.index(['run_id', 'id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

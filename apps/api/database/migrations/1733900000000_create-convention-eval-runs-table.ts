import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A convention test of an agent configuration (`POST /agent-configs/:id/evals`): which path and
 * agent ran it, with which provider and model, how it ended, what it was estimated to cost and
 * what it cost. No credential and no output of an agent: those are on its trials, filtered.
 */
export default class extends BaseSchema {
  protected tableName = 'convention_eval_runs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.string('path', 16).notNullable()
      table.string('agent', 32).notNullable()
      table.string('provider_kind', 32).notNullable()
      table.string('model', 200).notNullable()
      table.string('status', 16).notNullable()
      table.string('failure_reason', 64).nullable()
      table.decimal('cap_usd', 10, 4).notNullable()
      table.decimal('estimate_low_usd', 10, 4).nullable()
      table.decimal('estimate_high_usd', 10, 4).nullable()
      table.string('prices_checked_on', 10).notNullable()
      table.decimal('cost_usd', 10, 4).nullable()
      table.integer('input_tokens').notNullable().defaultTo(0)
      table.integer('cached_input_tokens').notNullable().defaultTo(0)
      table.integer('cache_write_tokens').notNullable().defaultTo(0)
      table.integer('output_tokens').notNullable().defaultTo(0)
      table.integer('trial_count').notNullable()
      table.integer('config_revision').notNullable()
      table.string('catalog_version', 32).notNullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('ended_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['agent_config_id', 'id'])
      table.index(['status', 'started_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

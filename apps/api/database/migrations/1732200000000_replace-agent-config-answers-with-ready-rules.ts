import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Questionnaires give way to ready-made rules: a configuration holds the catalog's rules its
 * owner accepted, one row per rule, named by its group's slot and its id. Stored answers are
 * deleted, not converted, and a configuration no longer names questionnaires (every rule pack of
 * the catalog is open to it).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.dropTable('agent_config_answers')
    this.schema.alterTable('agent_configs', (table) => {
      table.dropColumn('questionnaires')
    })
    this.schema.createTable('agent_config_ready_rules', (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.string('slot', 64).notNullable()
      table.string('rule', 64).notNullable()
      // The text typed into a rule that takes one.
      table.string('value', 500).nullable()
      table.unique(['agent_config_id', 'slot', 'rule'])
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  /** The former tables come back empty: the answers were deleted, and the rules do not map back. */
  async down() {
    this.schema.dropTable('agent_config_ready_rules')
    this.schema.alterTable('agent_configs', (table) => {
      table.jsonb('questionnaires').notNullable().defaultTo('[]')
    })
    this.schema.createTable('agent_config_answers', (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.string('questionnaire_id', 64).notNullable()
      table.string('question_id', 64).notNullable()
      table.jsonb('value').notNullable()
      table.text('details').nullable()
      table.unique(['agent_config_id', 'questionnaire_id', 'question_id'])
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }
}

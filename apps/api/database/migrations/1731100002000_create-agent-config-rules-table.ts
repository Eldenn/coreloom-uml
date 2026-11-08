import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  AGENT_RULE_SOURCES,
  AGENT_RULE_TEXT_MAX_LENGTH,
  AgentRuleSource,
} from '#app/agent-configs/constants/agent-config'

/** Accepted rules: one line added to a section of AGENTS.md, by hand or from a proposal. */
export default class extends BaseSchema {
  protected tableName = 'agent_config_rules'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('agent_config_id')
        .notNullable()
        .references('id')
        .inTable('agent_configs')
        .onDelete('CASCADE')
      table.index('agent_config_id')
      table.string('section', 64).notNullable()
      table.string('text', AGENT_RULE_TEXT_MAX_LENGTH).notNullable()
      table
        .enu('source', [...AGENT_RULE_SOURCES], { useNative: false, enumName: 'agent_rule_source' })
        .notNullable()
        .defaultTo(AgentRuleSource.Manual)
      table.integer('position').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

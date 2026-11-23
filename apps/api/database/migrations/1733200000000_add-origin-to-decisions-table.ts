import { BaseSchema } from '@adonisjs/lucid/schema'
import { DECISION_ORIGINS, DecisionOrigin } from '#app/decisions/constants/decision'

/**
 * Who recorded a decision: the owner, or a coding agent through the MCP tool `propose_decision`
 * (a proposal the owner reviews), and the decision such a proposal says no longer holds. Every
 * decision recorded so far is the owner's.
 */
export default class extends BaseSchema {
  protected tableName = 'decisions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('origin', DECISION_ORIGINS).notNullable().defaultTo(DecisionOrigin.Owner)
      table
        .integer('supersedes_id')
        .nullable()
        .references('id')
        .inTable('decisions')
        .onDelete('SET NULL')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('supersedes_id')
      table.dropColumn('origin')
    })
  }
}

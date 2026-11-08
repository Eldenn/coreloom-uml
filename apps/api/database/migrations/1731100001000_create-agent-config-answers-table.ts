import { BaseSchema } from '@adonisjs/lucid/schema'

/** One answer per question: a scale (number), a choice or a text (string), or choices (string[]). */
export default class extends BaseSchema {
  protected tableName = 'agent_config_answers'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
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
      // "More details": never rendered as is, only the input of rule proposals.
      table.text('details').nullable()
      table.unique(['agent_config_id', 'questionnaire_id', 'question_id'])
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

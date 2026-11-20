import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The repository sandbox of an assistant conversation: an E2B sandbox holding a clone of one
 * GitHub repository, paused between messages. The row says which sandbox and which repository;
 * the code is only in the sandbox. Deleting the conversation or the account kills the sandbox
 * too, and `PruneAssistantSandboxesJob` kills one unused for `REPOSITORY_SANDBOX.maxIdleDays`.
 */
export default class extends BaseSchema {
  protected tableName = 'assistant_sandboxes'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('conversation_id')
        .notNullable()
        .unique()
        .references('id')
        .inTable('assistant_conversations')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.string('sandbox_id', 100).notNullable()
      table.string('repository_url', 300).notNullable()
      table.string('branch', 255).nullable()
      table.string('commit_sha', 64).notNullable()
      /** Cloned with an installation token: read again only while the owner keeps a grant. */
      table.boolean('private').notNullable()
      table.timestamp('last_used_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.index(['last_used_at'])
      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

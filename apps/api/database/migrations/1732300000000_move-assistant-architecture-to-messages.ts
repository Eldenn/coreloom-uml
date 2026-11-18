import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * An assistant conversation belongs to the account, no longer to one architecture: each message
 * says which architecture it is about (`architecture_id`, null when none, set to null when the
 * architecture is deleted), filled for the existing messages from their conversation. A message
 * may also keep the proposals of a web research (`proposals`).
 *
 * Rolling back gives each conversation the architecture of its first message that has one
 * (nullable: a conversation with none keeps none).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('assistant_messages', (table) => {
      table
        .integer('architecture_id')
        .nullable()
        .references('id')
        .inTable('architectures')
        .onDelete('SET NULL')
      table.jsonb('proposals').nullable()
      table.index('architecture_id')
    })
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE assistant_messages
         SET architecture_id = assistant_conversations.architecture_id
         FROM assistant_conversations
         WHERE assistant_conversations.id = assistant_messages.conversation_id`,
      )
    })
    this.schema.alterTable('assistant_conversations', (table) => {
      table.dropIndex(['architecture_id', 'updated_at'])
      table.dropForeign('architecture_id')
      table.dropColumn('architecture_id')
      table.index(['user_id', 'updated_at'])
    })
  }

  async down() {
    this.schema.alterTable('assistant_conversations', (table) => {
      table.dropIndex(['user_id', 'updated_at'])
      table
        .integer('architecture_id')
        .nullable()
        .references('id')
        .inTable('architectures')
        .onDelete('CASCADE')
      table.index(['architecture_id', 'updated_at'])
    })
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE assistant_conversations
         SET architecture_id = (
           SELECT assistant_messages.architecture_id FROM assistant_messages
           WHERE assistant_messages.conversation_id = assistant_conversations.id
             AND assistant_messages.architecture_id IS NOT NULL
           ORDER BY assistant_messages.id ASC
           LIMIT 1
         )`,
      )
    })
    this.schema.alterTable('assistant_messages', (table) => {
      table.dropColumn('architecture_id')
      table.dropColumn('proposals')
    })
  }
}

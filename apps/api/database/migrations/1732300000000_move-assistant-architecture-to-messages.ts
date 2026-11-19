import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * An assistant conversation belongs to the account, no longer to one architecture: each message
 * says which architecture it is about (`architecture_id`, null when none, set to null when the
 * architecture is deleted), filled for the existing messages from their conversation. A message
 * may also keep the proposals of a web research (`proposals`).
 *
 * A conversation now outlives the architectures it was about, so a trigger empties the two
 * states (`before`, `after`) of every change proposed for an architecture when it is deleted,
 * whatever deletes it (the route, or the cascade of its project or account): the diagrams go
 * with their architecture.
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
      // The new index starts with `user_id`: the old one on that column alone is redundant.
      table.dropIndex('user_id')
      table.index(['user_id', 'updated_at'])
    })
    this.schema.raw(`
      CREATE FUNCTION assistant_forget_architecture() RETURNS trigger AS $$
      BEGIN
        UPDATE assistant_messages
        SET changes = (
          SELECT jsonb_agg(change || '{"before": null, "after": null}'::jsonb)
          FROM jsonb_array_elements(changes) AS change
        )
        WHERE architecture_id = OLD.id AND jsonb_typeof(changes) = 'array';
        RETURN OLD;
      END
      $$ LANGUAGE plpgsql
    `)
    this.schema.raw(`
      CREATE TRIGGER assistant_forget_architecture
      BEFORE DELETE ON architectures
      FOR EACH ROW EXECUTE FUNCTION assistant_forget_architecture()
    `)
  }

  async down() {
    this.schema.raw('DROP TRIGGER assistant_forget_architecture ON architectures')
    this.schema.raw('DROP FUNCTION assistant_forget_architecture()')
    this.schema.alterTable('assistant_conversations', (table) => {
      table.dropIndex(['user_id', 'updated_at'])
      table.index('user_id')
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

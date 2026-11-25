import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Where a skill's tags come from (`skill-topics.ts`): `search_topics` are those of the search
 * queries that found it (and, for a hand-picked skill, the package's), `tagger_topics` those the
 * tagger gave, null until it tagged the skill, and `reviewed_topics` those the admin set, null
 * until then. `topics` stays the column everything reads: the admin's, else the tagger's when it
 * gave one, else the search's.
 *
 * `skill_embeddings` holds what the tagger read of each skill: one vector per skill, for the text
 * and model whose hash is `hash`, so a skill is embedded again only when either changes. Its own
 * table, so reading the catalog never loads the vectors.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('skills', (table) => {
      table.jsonb('search_topics').notNullable().defaultTo('[]')
      table.jsonb('tagger_topics').nullable()
      table.jsonb('reviewed_topics').nullable()
      table.timestamp('reviewed_at', { useTz: true }).nullable()
    })
    this.schema.createTable('skill_embeddings', (table) => {
      table
        .integer('skill_id')
        .unsigned()
        .primary()
        .references('id')
        .inTable('skills')
        .onDelete('CASCADE')
      table.string('hash', 64).notNullable()
      table.specificType('vector', 'real[]').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
    })
    this.defer(async (db) => {
      await db.rawQuery('update skills set search_topics = topics')
    })
  }

  async down() {
    this.schema.dropTable('skill_embeddings')
    this.schema.alterTable('skills', (table) => {
      table.dropColumn('search_topics')
      table.dropColumn('tagger_topics')
      table.dropColumn('reviewed_topics')
      table.dropColumn('reviewed_at')
    })
  }
}

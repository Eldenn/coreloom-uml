import { BaseSchema } from '@adonisjs/lucid/schema'
import { WATCH_LIMITS, WATCH_SOURCE_KINDS } from '#app/watch/constants/watch'
import { WEB_SEARCH_LIMITS } from '#app/web-search/constants/web-search'

/**
 * The tech watch (`app/watch/`), shared by the whole instance. `watch_sources` are what the admin
 * picks, each with optional tags of its own: a feed (`url`) or a web search (`query`). `watch_articles` keeps of each item a title, its
 * link (unique), its site, its date and a short excerpt, never the page; it goes 90 days after its
 * publication. `watch_blocked_sites` are hosts never taken in. `watch_article_embeddings` holds
 * what the skill tagger read of each article (its own table, so reading the page never loads a
 * vector).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('watch_sources', (table) => {
      table.increments('id').notNullable()
      table.enum('kind', [...WATCH_SOURCE_KINDS]).notNullable()
      table.string('url', WATCH_LIMITS.urlMaxLength).nullable().unique()
      table.string('query', WEB_SEARCH_LIMITS.queryMaxLength).nullable().unique()
      table.string('title', WATCH_LIMITS.sourceTitleMaxLength).nullable()
      table.jsonb('topics').notNullable().defaultTo('[]')
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('last_run_at', { useTz: true }).nullable()
      table.string('last_error', WATCH_LIMITS.errorMaxLength).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
    this.schema.raw(
      `ALTER TABLE watch_sources ADD CONSTRAINT watch_sources_kind_target CHECK (
        (kind = 'rss' AND url IS NOT NULL AND query IS NULL)
        OR (kind = 'linkup' AND query IS NOT NULL AND url IS NULL))`,
    )
    this.schema.createTable('watch_articles', (table) => {
      table.increments('id').notNullable()
      table
        .integer('source_id')
        .nullable()
        .references('id')
        .inTable('watch_sources')
        .onDelete('SET NULL')
      table.string('url', WATCH_LIMITS.urlMaxLength).notNullable().unique()
      table.string('site', WATCH_LIMITS.hostMaxLength).notNullable()
      table.string('title', WATCH_LIMITS.titleMaxLength).notNullable()
      table.string('excerpt', WATCH_LIMITS.excerptMaxLength).notNullable()
      table.timestamp('published_at', { useTz: true }).notNullable()
      // What everything reads (`effectiveTopics`): the admin's, else the tagger's, else the feed's.
      table.jsonb('topics').notNullable().defaultTo('[]')
      table.jsonb('source_topics').notNullable().defaultTo('[]')
      table.jsonb('tagger_topics').nullable()
      table.jsonb('reviewed_topics').nullable()
      table.boolean('hidden').notNullable().defaultTo(false)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['hidden', 'published_at'])
      table.index('site')
    })
    this.schema.createTable('watch_article_embeddings', (table) => {
      table
        .integer('article_id')
        .primary()
        .references('id')
        .inTable('watch_articles')
        .onDelete('CASCADE')
      table.string('hash', 64).notNullable()
      table.specificType('vector', 'real[]').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
    })
    this.schema.createTable('watch_blocked_sites', (table) => {
      table.increments('id').notNullable()
      table.string('host', WATCH_LIMITS.hostMaxLength).notNullable().unique()
      table.timestamp('created_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('watch_blocked_sites')
    this.schema.dropTable('watch_article_embeddings')
    this.schema.dropTable('watch_articles')
    this.schema.dropTable('watch_sources')
  }
}

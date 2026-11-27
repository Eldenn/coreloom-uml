import { BaseSchema } from '@adonisjs/lucid/schema'
import { WATCH_FEED_KINDS, WATCH_LIMITS } from '#app/watch/constants/watch'

/**
 * The tech watch (`app/watch/`), shared by the whole instance. `watch_feeds` are the feeds the
 * admin picks, each with optional tags of its own. `watch_articles` keeps of each item a title, its
 * link (unique), its site, its date and a short excerpt, never the page; it goes 90 days after its
 * publication. `watch_blocked_sites` are hosts never taken in. `watch_article_embeddings` holds
 * what the skill tagger read of each article (its own table, so reading the page never loads a
 * vector).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('watch_feeds', (table) => {
      table.increments('id').notNullable()
      table.enum('kind', [...WATCH_FEED_KINDS]).notNullable()
      table.string('url', WATCH_LIMITS.urlMaxLength).notNullable().unique()
      table.string('title', WATCH_LIMITS.feedTitleMaxLength).nullable()
      table.jsonb('topics').notNullable().defaultTo('[]')
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('last_run_at', { useTz: true }).nullable()
      table.string('last_error', WATCH_LIMITS.errorMaxLength).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
    this.schema.createTable('watch_articles', (table) => {
      table.increments('id').notNullable()
      table
        .integer('feed_id')
        .nullable()
        .references('id')
        .inTable('watch_feeds')
        .onDelete('SET NULL')
      table.string('url', WATCH_LIMITS.urlMaxLength).notNullable().unique()
      table.string('site', WATCH_LIMITS.hostMaxLength).notNullable()
      table.string('title', WATCH_LIMITS.titleMaxLength).notNullable()
      table.string('excerpt', WATCH_LIMITS.excerptMaxLength).notNullable()
      table.timestamp('published_at', { useTz: true }).notNullable()
      // What everything reads (`effectiveTopics`): the admin's, else the tagger's, else the feed's.
      table.jsonb('topics').notNullable().defaultTo('[]')
      table.jsonb('feed_topics').notNullable().defaultTo('[]')
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
    this.schema.dropTable('watch_feeds')
  }
}

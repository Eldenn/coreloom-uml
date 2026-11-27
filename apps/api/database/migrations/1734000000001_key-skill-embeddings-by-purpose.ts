import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `skill_embeddings` keeps one vector per skill and purpose (`classification` for the tagger,
 * `retrieval` for the search), so the tagger's vectors never serve the search; the rows there
 * were the tagger's. The last migration of computed affinities on purpose: going back to an image
 * without them is `node ace migration:rollback --step=1`, which reverts this one alone and keeps
 * the admin's decisions in `skill_affinity_reviews`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('skill_embeddings', (table) => {
      table.string('purpose', 20).notNullable().defaultTo('classification')
    })
    this.schema.raw('ALTER TABLE skill_embeddings DROP CONSTRAINT skill_embeddings_pkey')
    this.schema.raw('ALTER TABLE skill_embeddings ADD PRIMARY KEY (skill_id, purpose)')
    this.schema.raw('ALTER TABLE skill_embeddings ALTER COLUMN purpose DROP DEFAULT')
  }

  async down() {
    this.defer(async (db) => {
      await db.from('skill_embeddings').whereNot('purpose', 'classification').delete()
    })
    this.schema.raw('ALTER TABLE skill_embeddings DROP CONSTRAINT skill_embeddings_pkey')
    this.schema.raw('ALTER TABLE skill_embeddings ADD PRIMARY KEY (skill_id)')
    this.schema.alterTable('skill_embeddings', (table) => {
      table.dropColumn('purpose')
    })
  }
}

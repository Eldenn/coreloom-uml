import { BaseSchema } from '@adonisjs/lucid/schema'
import { AFFINITY_DECISIONS, SKILL_RULE_SCORING } from '#app/skills/constants/skill-affinities'

const KEY = SKILL_RULE_SCORING.keyMaxLength

/**
 * Computed skill affinities (`skill-rule-scores.ts`). `rule_embeddings` holds each ready-made rule's vector;
 * `skill_rule_scores` the pairs of cosine from the floor, replaced whole at each run;
 * `skill_near_duplicates` the skills nearly identical to one that comes first;
 * `skill_affinity_reviews` the pairs proposed to the admin and what was decided (null while
 * pending), kept whatever the model; `skill_scoring_state` the one row saying which model and
 * catalog the last finished run scored.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('rule_embeddings', (table) => {
      table.string('slot', KEY).notNullable()
      table.string('rule_id', KEY).notNullable()
      table.string('hash', 64).notNullable()
      table.specificType('vector', 'real[]').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.primary(['slot', 'rule_id'])
    })
    this.schema.createTable('skill_rule_scores', (table) => {
      table
        .integer('skill_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('skills')
        .onDelete('CASCADE')
      table.string('slot', KEY).notNullable()
      table.string('rule_id', KEY).notNullable()
      table.specificType('cosine', 'real').notNullable()
      table.primary(['skill_id', 'slot', 'rule_id'])
    })
    this.schema.createTable('skill_near_duplicates', (table) => {
      table
        .integer('skill_id')
        .unsigned()
        .primary()
        .references('id')
        .inTable('skills')
        .onDelete('CASCADE')
      table
        .integer('duplicate_of')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('skills')
        .onDelete('CASCADE')
    })
    this.schema.createTable('skill_affinity_reviews', (table) => {
      table.increments('id').notNullable()
      table
        .integer('skill_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('skills')
        .onDelete('CASCADE')
      table.string('slot', KEY).notNullable()
      table.string('rule_id', KEY).notNullable()
      table.specificType('cosine', 'real').notNullable()
      table.enum('decision', [...AFFINITY_DECISIONS]).nullable()
      table.timestamp('decided_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.unique(['skill_id', 'slot', 'rule_id'])
    })
    this.schema.createTable('skill_scoring_state', (table) => {
      table.integer('id').primary()
      table.string('hash', 64).notNullable()
      table.timestamp('scored_at', { useTz: true }).notNullable()
    })
    this.schema.raw(
      'ALTER TABLE skill_scoring_state ADD CONSTRAINT skill_scoring_state_one CHECK (id = 1)',
    )
  }

  async down() {
    this.schema.dropTable('skill_scoring_state')
    this.schema.dropTable('skill_affinity_reviews')
    this.schema.dropTable('skill_near_duplicates')
    this.schema.dropTable('skill_rule_scores')
    this.schema.dropTable('rule_embeddings')
  }
}

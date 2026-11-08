import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The skills catalog: the hand-picked skills of `@coreloom-uml/catalog` (`origin = manual`,
 * copied by `node ace skills:setup`) and every skill the weekly search finds on skills.sh
 * (`origin = search`). Found skills accumulate: one that fails a check stays catalogued with
 * `eligible = false` and its reason, and only eligible, active skills are suggested.
 * Not owned by any account.
 */
export default class extends BaseSchema {
  protected tableName = 'skills'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      // The catalog's kebab-case id.
      table.string('slug', 100).notNullable().unique()
      table.string('name', 80).notNullable()
      // `{ en, fr? }`; `en` is empty until the search has read the skill's SKILL.md.
      table.jsonb('description').notNullable()
      // A GitHub folder pinned to a commit, or the skills.sh page until the skill is checked.
      table.string('url', 500).notNullable()
      table.jsonb('targets').notNullable()
      table.jsonb('affinities').notNullable()
      // The search plan's topics the skill was found under.
      table.jsonb('topics').notNullable()
      table.enum('origin', ['manual', 'search']).notNullable()
      table.enum('status', ['active', 'blocked']).notNullable().defaultTo('active')
      table.string('status_reason', 300).nullable()
      table.boolean('eligible').notNullable().defaultTo(false)
      table.string('ineligible_reason', 300).nullable()
      // skills.sh: `owner/repo/slug`, `owner/repo`, installs and security audits.
      table.string('registry_id', 300).nullable().unique()
      table.string('source', 200).nullable()
      table.integer('installs').nullable()
      table.jsonb('audits').notNullable()
      // GitHub: the repository's SPDX licence and the pinned folder's tree SHA.
      table.string('license', 100).nullable()
      table.string('content_sha', 40).nullable()
      table.timestamp('first_seen_at').nullable()
      table.timestamp('last_seen_at').nullable()
      table.timestamp('checked_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.index(['status', 'eligible'])
      table.index(['installs'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

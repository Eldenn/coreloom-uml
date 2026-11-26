import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  SKILL_SOURCE_KINDS,
  SKILL_SOURCE_LIMITS,
  SkillSourceKind,
} from '#app/skills/constants/skill'

/**
 * Where the weekly search looks for skills: skills.sh (created here, enabled; it can be disabled,
 * never deleted) and the GitHub repositories the admin adds. `skill_source_skills` says which
 * source listed which skill at its last run that answered.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.createTable('skill_sources', (table) => {
      table.increments('id').notNullable()
      table.enum('kind', [...SKILL_SOURCE_KINDS]).notNullable()
      // GitHub only: the repository and the folder its listing starts from (null: the root).
      table.string('owner', 100).nullable()
      table.string('repo', 100).nullable()
      table.string('path', SKILL_SOURCE_LIMITS.pathMaxLength).nullable()
      table.boolean('enabled').notNullable().defaultTo(true)
      table.timestamp('last_run_at').nullable()
      table.string('last_error', SKILL_SOURCE_LIMITS.errorMaxLength).nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
    this.schema.raw(
      `CREATE UNIQUE INDEX skill_sources_identity ON skill_sources
        (kind, coalesce(owner, ''), coalesce(repo, ''), coalesce(path, ''))`,
    )
    this.schema.createTable('skill_source_skills', (table) => {
      table
        .integer('skill_source_id')
        .notNullable()
        .references('id')
        .inTable('skill_sources')
        .onDelete('CASCADE')
      table.integer('skill_id').notNullable().references('id').inTable('skills').onDelete('CASCADE')
      table.primary(['skill_source_id', 'skill_id'])
      table.index('skill_id')
    })
    this.defer(async (db) => {
      const now = new Date()
      await db
        .table('skill_sources')
        .insert({ kind: SkillSourceKind.SkillsSh, enabled: true, created_at: now, updated_at: now })
    })
  }

  async down() {
    this.schema.dropTable('skill_source_skills')
    this.schema.dropTable('skill_sources')
  }
}

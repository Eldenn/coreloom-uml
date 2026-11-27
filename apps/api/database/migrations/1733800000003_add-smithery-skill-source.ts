import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Smithery becomes a source kind, created here enabled: like skills.sh it can be disabled, never
 * deleted. The kinds are written out so this migration stays what it was when they change.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('ALTER TABLE skill_sources DROP CONSTRAINT skill_sources_kind_check')
    this.schema.raw(
      `ALTER TABLE skill_sources ADD CONSTRAINT skill_sources_kind_check
        CHECK (kind IN ('skills-sh', 'github', 'smithery'))`,
    )
    this.defer(async (db) => {
      const now = new Date()
      await db
        .table('skill_sources')
        .insert({ kind: 'smithery', enabled: true, created_at: now, updated_at: now })
    })
  }

  async down() {
    this.schema.raw(`DELETE FROM skill_sources WHERE kind = 'smithery'`)
    this.schema.raw('ALTER TABLE skill_sources DROP CONSTRAINT skill_sources_kind_check')
    this.schema.raw(
      `ALTER TABLE skill_sources ADD CONSTRAINT skill_sources_kind_check
        CHECK (kind IN ('skills-sh', 'github'))`,
    )
  }
}

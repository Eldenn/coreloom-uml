import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What the admin's own model said of a copy (`SkillModelReview`), asked from its sheet: null until
 * asked, replaced whole by the next reading. An aid to the admin's decision, never a condition of
 * it.
 */
export default class extends BaseSchema {
  protected tableName = 'skill_versions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('model_review').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('model_review')
    })
  }
}

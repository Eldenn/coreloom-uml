import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * SkillSpector's verdict on a copy (`SkillScan`): null until the `skill-scanner` worker has
 * scanned it. Written by `scanSkillVersion` only. `override_reason`: why the admin approved a
 * copy it recommends not installing, null otherwise.
 */
export default class extends BaseSchema {
  protected tableName = 'skill_versions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('scan').nullable()
      table.text('override_reason').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('scan')
      table.dropColumn('override_reason')
    })
  }
}

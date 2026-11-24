import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * SkillSpector's verdict on a copy (`SkillScan`): null until the `skill-scanner` worker has
 * scanned it. Written by `scanSkillVersion` only.
 */
export default class extends BaseSchema {
  protected tableName = 'skill_versions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('scan').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('scan')
    })
  }
}

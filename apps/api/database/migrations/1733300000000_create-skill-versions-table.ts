import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A copy of a skill's folder at one commit, the files in Drive (`storage_key`). One per skill
 * and content SHA (the Git tree of the folder): never changed afterwards but for its review.
 */
export default class extends BaseSchema {
  protected tableName = 'skill_versions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('skill_id').notNullable().references('id').inTable('skills').onDelete('CASCADE')
      table.string('content_sha', 40).notNullable()
      table.string('repository', 200).notNullable()
      table.string('commit', 40).notNullable()
      table.string('folder', 500).notNullable()
      // An SPDX id, or `in-folder` when a licence file is among the files.
      table.string('license', 50).notNullable()
      // `{ path, size, executable }[]`, sorted by path: the list reads it, never the files.
      table.jsonb('files').notNullable()
      table.integer('bytes').notNullable()
      table.string('storage_key', 300).notNullable()
      table.string('status', 20).notNullable()
      table.integer('reviewed_by').nullable().references('id').inTable('users').onDelete('SET NULL')
      table.timestamp('reviewed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.unique(['skill_id', 'content_sha'])
      table.index(['status', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

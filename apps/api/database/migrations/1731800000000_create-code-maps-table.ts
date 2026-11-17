import { BaseSchema } from '@adonisjs/lucid/schema'
import { CODE_MAP_SOURCES, CODE_MAP_STATUSES } from '#app/code-maps/constants/code-map'

/**
 * The code maps of a project: the header of each extraction. The graph itself is a gzipped
 * `CodeMap` in Drive (`storage_key`), never in the database.
 */
export default class extends BaseSchema {
  protected tableName = 'code_maps'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('project_id')
        .notNullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.enum('source', CODE_MAP_SOURCES).notNullable()
      table.string('repository_url', 1024).nullable()
      table.string('branch', 200).nullable()
      table.string('commit_sha', 64).nullable()
      table.string('extractor', 200).notNullable()
      table.string('extractor_version', 200).notNullable()
      table.enum('status', CODE_MAP_STATUSES).notNullable()
      table.string('failure_reason', 500).nullable()
      table.integer('node_count').notNullable().defaultTo(0)
      table.integer('edge_count').notNullable().defaultTo(0)
      table.string('storage_key', 255).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.index(['project_id', 'created_at'])
      table.index('user_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

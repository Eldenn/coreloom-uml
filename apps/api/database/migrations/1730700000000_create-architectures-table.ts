import { BaseSchema } from '@adonisjs/lucid/schema'
import {
  ARCHITECTURE_VISIBILITIES,
  ArchitectureVisibility,
} from '#app/architectures/constants/visibility'

export default class extends BaseSchema {
  protected tableName = 'architectures'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.index('user_id')
      table.string('title', 120).notNullable()
      table.text('description').nullable()
      table
        .enu('visibility', [...ARCHITECTURE_VISIBILITIES], {
          useNative: false,
          enumName: 'architecture_visibility',
        })
        .notNullable()
        .defaultTo(ArchitectureVisibility.Private)
      // Sharing: one link per architecture (random token), and for a protected
      // link an access code stored encrypted so the owner can read it again.
      table.string('share_token', 64).nullable().unique()
      table.text('access_code').nullable()
      // Bumped when the code is regenerated: grants issued before it stop working.
      table.integer('access_version').notNullable().defaultTo(1)
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

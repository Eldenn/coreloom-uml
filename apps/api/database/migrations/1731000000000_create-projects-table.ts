import { BaseSchema } from '@adonisjs/lucid/schema'
import { DEFAULT_PROJECT_NAME } from '#app/projects/constants/limits'

/**
 * Projects: the top-level container of an account's design work. Architectures
 * (sets of UML diagrams) are the first kind of artifact they hold; later kinds
 * get their own table with a `project_id` the same way.
 *
 * Existing architectures move into a "Default project" created for each
 * account that has some, so nothing is lost and every architecture keeps its
 * id, its diagrams and its share link.
 */
export default class extends BaseSchema {
  protected tableName = 'projects'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.index('user_id')
      table.string('name', 120).notNullable()
      table.text('description').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })

    this.schema.alterTable('architectures', (table) => {
      // Nullable until the existing rows are moved below.
      table
        .integer('project_id')
        .nullable()
        .references('id')
        .inTable('projects')
        .onDelete('CASCADE')
      table.index('project_id')
    })

    this.defer(async (db) => {
      await db.rawQuery(
        `INSERT INTO projects (user_id, name, created_at, updated_at)
         SELECT user_id, ?, MIN(created_at), MAX(updated_at)
         FROM architectures
         GROUP BY user_id`,
        [DEFAULT_PROJECT_NAME],
      )
      await db.rawQuery(
        `UPDATE architectures
         SET project_id = projects.id
         FROM projects
         WHERE projects.user_id = architectures.user_id`,
      )
    })

    this.schema.alterTable('architectures', (table) => {
      table.integer('project_id').notNullable().alter()
    })
  }

  async down() {
    this.schema.alterTable('architectures', (table) => {
      table.dropColumn('project_id')
    })
    this.schema.dropTable(this.tableName)
  }
}

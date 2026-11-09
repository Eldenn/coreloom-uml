import { BaseSchema } from '@adonisjs/lucid/schema'
import { DEFAULT_PROJECT_NAME } from '#app/projects/constants/limits'

/**
 * An architecture may now stand on its own, outside any project: `project_id`
 * becomes nullable. Deleting a project still deletes the architectures it holds.
 *
 * Rolling back puts the ones without a project back into a "Default project"
 * per account, as the migration that introduced projects did.
 */
export default class extends BaseSchema {
  protected tableName = 'architectures'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('project_id').nullable().alter()
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `INSERT INTO projects (user_id, name, created_at, updated_at)
         SELECT user_id, ?, MIN(created_at), MAX(updated_at)
         FROM architectures
         WHERE project_id IS NULL
         GROUP BY user_id`,
        [DEFAULT_PROJECT_NAME],
      )
      await db.rawQuery(
        `UPDATE architectures
         SET project_id = (
           SELECT MAX(projects.id) FROM projects
           WHERE projects.user_id = architectures.user_id AND projects.name = ?
         )
         WHERE project_id IS NULL`,
        [DEFAULT_PROJECT_NAME],
      )
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('project_id').notNullable().alter()
    })
  }
}

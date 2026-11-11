import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Agent conventions may now stand on their own, outside any project, like architectures:
 * `project_id` becomes nullable (still unique: a project holds at most one configuration) and
 * each configuration gets a `name`, filled with its project's name for the existing ones.
 *
 * Rolling back puts each configuration without a project into a new project of its own,
 * named after it, since a project can only hold one.
 */
export default class extends BaseSchema {
  protected tableName = 'agent_configs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('name', 120).nullable()
      table.integer('project_id').nullable().alter()
    })
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE agent_configs SET name = projects.name
         FROM projects WHERE projects.id = agent_configs.project_id`,
      )
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.string('name', 120).notNullable().alter()
    })
  }

  async down() {
    this.defer(async (db) => {
      const standalone = await db
        .from(this.tableName)
        .whereNull('project_id')
        .select('id', 'user_id', 'name', 'created_at', 'updated_at')
      for (const config of standalone) {
        const [project] = await db
          .table('projects')
          .insert({
            user_id: config.user_id,
            name: config.name,
            created_at: config.created_at,
            updated_at: config.updated_at,
          })
          .returning('id')
        await db.from(this.tableName).where('id', config.id).update({ project_id: project.id })
      }
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('name')
      table.integer('project_id').notNullable().alter()
    })
  }
}

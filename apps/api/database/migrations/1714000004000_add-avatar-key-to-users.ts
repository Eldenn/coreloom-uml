import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Object-storage key of the user's avatar (e.g. `avatars/42.png`), or
      // null when none is set. The bytes live in @adonisjs/drive, not the DB.
      table.string('avatar_key').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('avatar_key')
    })
  }
}

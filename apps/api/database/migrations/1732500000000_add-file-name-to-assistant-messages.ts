import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The name of the file the owner attached to a message (`file_name`, null without one). The
 * file's content goes to the model with that message and is never stored.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('assistant_messages', (table) => {
      table.string('file_name', 255).nullable()
    })
  }

  async down() {
    this.schema.alterTable('assistant_messages', (table) => {
      table.dropColumn('file_name')
    })
  }
}

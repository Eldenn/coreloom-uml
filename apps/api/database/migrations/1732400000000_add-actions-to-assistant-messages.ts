import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The actions an assistant message proposed on the account's projects, architectures and agent
 * conventions (`actions`, null when none): each one waits for the owner to accept or reject it.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('assistant_messages', (table) => {
      table.jsonb('actions').nullable()
    })
  }

  async down() {
    this.schema.alterTable('assistant_messages', (table) => {
      table.dropColumn('actions')
    })
  }
}

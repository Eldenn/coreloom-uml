import { BaseSchema } from '@adonisjs/lucid/schema'
import { API_TOKEN_HINT_LENGTH } from '#app/api-tokens/constants/api-token'

/**
 * The table `DbAccessTokensProvider` (@adonisjs/auth) reads and writes, plus
 * `hint`: the token's last characters, kept so the account page can tell
 * tokens apart without ever storing the secret.
 */
export default class extends BaseSchema {
  protected tableName = 'auth_access_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('tokenable_id')
        .notNullable()
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('type').notNullable()
      table.string('name').nullable()
      table.string('hash').notNullable()
      table.string('hint', API_TOKEN_HINT_LENGTH).nullable()
      table.text('abilities').notNullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
      table.timestamp('last_used_at').nullable()
      table.timestamp('expires_at').nullable()
      table.index(['tokenable_id', 'type'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

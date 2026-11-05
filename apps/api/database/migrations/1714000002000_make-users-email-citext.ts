import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Make `users.email` case-insensitive.
 *
 * The application also lowercases every email before it hits the database
 * (the Vine input validators call `.toLowerCase()`), but `citext` is the
 * durable guarantee: it makes the UNIQUE index and every `where email = ?`
 * lookup case-insensitive regardless of how a row was written, so
 * `Ada@Example.com` and `ada@example.com` can never become two accounts.
 *
 * `CREATE EXTENSION citext` needs a role that is allowed to create
 * extensions (the default superuser on a fresh Postgres, and on the managed
 * databases we target). Ships with core Postgres — no package to install.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw('CREATE EXTENSION IF NOT EXISTS citext')
    this.schema.raw('ALTER TABLE users ALTER COLUMN email TYPE citext')
    // Normalize any rows written before this migration so stored values match
    // what the app now produces. A no-op on a fresh database.
    this.schema.raw('UPDATE users SET email = lower(email::text)')
  }

  async down() {
    this.schema.raw('ALTER TABLE users ALTER COLUMN email TYPE varchar(254)')
  }
}

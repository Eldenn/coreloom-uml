import { defineConfig } from '@adonisjs/lucid'
import env from '#start/env'

// TLS is on by default in production. Set DB_SSL=false when Postgres is only
// reachable on a private network without TLS (e.g. a Coolify-internal database).
const dbSsl = env.get('DB_SSL', env.get('NODE_ENV') === 'production')

const dbConfig = defineConfig({
  connection: 'pg',
  connections: {
    pg: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
        ssl: dbSsl ? { rejectUnauthorized: true, ca: env.get('DB_SSL_CA') } : false,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      seeders: {
        paths: ['database/seeders'],
      },
      debug: env.get('NODE_ENV') === 'development',
    },
  },
})

export default dbConfig

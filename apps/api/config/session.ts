import app from '@adonisjs/core/services/app'
import { defineConfig, stores } from '@adonisjs/session'
import env from '#start/env'

export default defineConfig({
  enabled: true,
  cookieName: 'coreloom-uml_session',
  clearWithBrowser: false,
  age: '2h',

  cookie: {
    path: '/',
    httpOnly: true,
    // `true` in production; override with SESSION_COOKIE_SECURE when needed.
    secure: env.get('SESSION_COOKIE_SECURE', env.get('NODE_ENV') === 'production'),
    // `lax` for a same-site SPA; set SESSION_COOKIE_SAME_SITE=none (with a
    // secure cookie) when the SPA is served from another domain.
    sameSite: env.get('SESSION_COOKIE_SAME_SITE', 'lax'),
  },

  // File-backed sessions — no Redis or database table needed for the MVP.
  // Tests set SESSION_DRIVER=memory (see .env.test) so the in-process Japa
  // session client and the app share the same in-memory store. Deploys that
  // run stateless (multiple replicas, no shared disk) set SESSION_DRIVER=cookie
  // to keep the encrypted session payload in the client cookie instead.
  store: env.get('SESSION_DRIVER', 'file'),

  stores: {
    file: stores.file({
      location: app.tmpPath('sessions'),
    }),
    // Reuses the `cookie` options above (secure, sameSite, httpOnly).
    cookie: stores.cookie(),
  },
})

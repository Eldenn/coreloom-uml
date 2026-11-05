import { defineConfig } from '@adonisjs/cors'
import { frontendOrigins } from '#app/shared/http/frontend-origins'
import env from '#start/env'

export default defineConfig({
  enabled: true,
  /**
   * Allow requests from the web SPA. Credentials (the session cookie) require
   * an explicit origin — no wildcard. Both localhost and 127.0.0.1 dev
   * origins are accepted (see frontendOrigins).
   */
  origin: frontendOrigins(env.get('FRONTEND_URL')),
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  headers: true,
  exposeHeaders: ['X-Request-Id'],
  credentials: true,
  maxAge: 90,
})

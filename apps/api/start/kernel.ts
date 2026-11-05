import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

/**
 * Global exception handler — converts unhandled errors to HTTP responses.
 */
server.errorHandler(() => import('#app/shared/exceptions/handler'))

/**
 * Server middleware runs on every request (including 404s).
 *
 * `shield` sits after `session` (it reads the session for CSRF) so its
 * security response headers are attached to every response, error pages and
 * 404s included. See `config/shield.ts` for what is enabled.
 */
server.use([
  () => import('@adonisjs/cors/cors_middleware'),
  () => import('@adonisjs/session/session_middleware'),
  () => import('@adonisjs/shield/shield_middleware'),
])

/**
 * Router middleware runs only on matched routes.
 */
router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
  () => import('@adonisjs/auth/initialize_auth_middleware'),
])

/**
 * Named middleware — referenced by name inside route definitions.
 *
 * @example
 * router.get('/auth/me', [MeController]).use(middleware.auth())
 */
export const middleware = router.named({
  auth: () => import('#app/auth/middleware/auth-middleware'),
  verified: () => import('#app/auth/middleware/verified-middleware'),
})

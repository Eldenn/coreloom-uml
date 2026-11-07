import limiter from '@adonisjs/limiter/services/main'
import { API_TOKEN_REQUESTS_PER_MINUTE } from '#app/api-tokens/constants/api-token'

/**
 * Per-IP throttle on the auth endpoints (register/login/logout/me), guarding
 * against brute-force and account-enumeration attempts.
 */
export const authThrottle = limiter.define('auth', () => {
  return limiter.allowRequests(10).every('1 minute')
})

/**
 * Per-token throttle on the routes an API token can reach. Runs after the
 * auth middleware; requests made with the session are not limited by it.
 */
export const apiTokenThrottle = limiter.define('api_token', ({ auth }) => {
  if (auth.authenticatedViaGuard !== 'api') return limiter.noLimit()
  const token = auth.use('api').getUserOrFail().currentAccessToken
  return limiter
    .allowRequests(API_TOKEN_REQUESTS_PER_MINUTE)
    .every('1 minute')
    .usingKey(`token_${token.identifier}`)
})

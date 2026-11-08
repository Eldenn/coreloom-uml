import limiter from '@adonisjs/limiter/services/main'
import { API_TOKEN_REQUESTS_PER_MINUTE } from '#app/api-tokens/constants/api-token'
import { LLM_REQUESTS_PER_MINUTE } from '#app/llm/constants/llm'

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

/**
 * Per-user throttle on the calls made with the user's own LLM provider (connection test and
 * rule proposals, one budget for both). Those routes accept the session only.
 */
export const llmThrottle = limiter.define('llm', ({ auth }) => {
  return limiter
    .allowRequests(LLM_REQUESTS_PER_MINUTE)
    .every('1 minute')
    .usingKey(`user_${auth.getUserOrFail().id}`)
})

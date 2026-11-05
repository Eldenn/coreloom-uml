import limiter from '@adonisjs/limiter/services/main'

/**
 * Per-IP throttle on the auth endpoints (register/login/logout/me), guarding
 * against brute-force and account-enumeration attempts.
 */
export const authThrottle = limiter.define('auth', () => {
  return limiter.allowRequests(10).every('1 minute')
})

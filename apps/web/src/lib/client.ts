import { registry } from '@coreloom-uml/api/registry'
import { createTuyau, TuyauError } from '@tuyau/core/client'

/**
 * API base URL, resolved in priority order:
 *  1. `window.__APP_CONFIG__.apiUrl` — written at container start by
 *     `apps/web/docker/30-render-env-js.sh` from `$API_URL`, so the same built
 *     image can be promoted across environments without a rebuild.
 *  2. `import.meta.env.VITE_API_URL` — build-time value, used for local dev.
 *  3. localhost fallback.
 * `||` (not `??`) so an empty string from a misconfigured `env.js` falls through.
 */
const API_URL =
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty string must fall through too
  window.__APP_CONFIG__?.apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3333'

/**
 * Resolved API base URL. Exported for the rare case of building a plain URL to
 * an API-served asset (e.g. the avatar bytes at `user.avatarUrl`); everything
 * else goes through the typed `client` below.
 */
export const apiBaseUrl = API_URL

/**
 * End-to-end typed API client generated from the AdonisJS routes, their Vine
 * input validators, and controller return types (see `apps/api/adonisrc.ts`).
 * `credentials: 'include'` sends the session cookie the API sets on login.
 */
export const client = createTuyau({
  registry,
  baseUrl: API_URL,
  credentials: 'include',
  headers: { Accept: 'application/json' },
})

export { TuyauError }

/**
 * Serialized current-user shape, inferred from the `GET /auth/me` response so
 * it stays in sync with `serializeUser` on the API.
 */
export type User = Awaited<ReturnType<typeof client.api.auth.me>>['user']

/**
 * Best-effort human-readable message from a failed Tuyau call. Covers the
 * API's `{ error: { message } }` payloads, Vine's `{ errors: [{ message }] }`
 * 422 shape, and AdonisJS's default `{ errors: [{ message }] }` auth errors.
 */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof TuyauError) {
    const body = error.response as
      | { error?: { message?: string }; errors?: { message?: string }[]; message?: string }
      | undefined
    return (
      body?.error?.message ??
      body?.errors?.[0]?.message ??
      body?.message ??
      (error.message || fallback)
    )
  }
  return error instanceof Error ? error.message : fallback
}

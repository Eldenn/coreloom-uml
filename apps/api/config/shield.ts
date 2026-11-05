import { defineConfig } from '@adonisjs/shield'

/**
 * Security response headers for the API. The API only ever returns JSON (plus
 * AdonisJS's built-in status pages in production), so the high-value guards
 * here are the transport/framing ones; CSP and CSRF are intentionally left
 * off — see the notes on each.
 */
const shieldConfig = defineConfig({
  /**
   * CSP is disabled on the API: it serves JSON, not documents, so a policy
   * has nothing to constrain here. The Content-Security-Policy that matters
   * is the one applied to the SPA at the nginx layer
   * (`apps/web/docker/nginx.conf.template`).
   */
  csp: {
    enabled: false,
    directives: {},
    reportOnly: false,
  },

  /**
   * CSRF is disabled because `apps/web` is a separate-origin SPA that talks to
   * this API over `fetch` with `credentials: 'include'`. The CSRF boundary is
   * already enforced by:
   *   - the strict CORS origin allowlist (`config/cors.ts`, no wildcard, exact
   *     `FRONTEND_URL` origin only), and
   *   - every client call sending `Accept`/`Content-Type: application/json`,
   *     which forces a CORS preflight the browser only lets through for that
   *     one origin.
   * Turn this on (and wire the `XSRF-TOKEN` cookie / `X-XSRF-TOKEN` header into
   * `apps/web/src/lib/client.ts`) once cookie-authed requests can originate
   * from outside that boundary — e.g. server-rendered forms.
   */
  csrf: {
    enabled: false,
    exceptRoutes: [],
    enableXsrfCookie: false,
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },

  /**
   * Never allow the API's responses to be embedded in a frame.
   */
  xFrame: {
    enabled: true,
    action: 'DENY',
  },

  /**
   * Advertise HTTPS-only to browsers. Harmless when TLS is terminated at the
   * edge proxy (Coolify / Traefik) in front of the API; the header still
   * reaches the browser.
   */
  hsts: {
    enabled: true,
    maxAge: '180 days',
    includeSubDomains: true,
  },

  /**
   * `X-Content-Type-Options: nosniff` — make the browser respect the declared
   * content type instead of guessing.
   */
  contentTypeSniffing: {
    enabled: true,
  },
})

export default shieldConfig

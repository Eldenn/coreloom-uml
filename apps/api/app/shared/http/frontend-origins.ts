/**
 * In local development the SPA is reached via either `localhost` or
 * `127.0.0.1`. These are distinct origins for CORS, so configuring only one
 * silently rejects the other. Given the canonical frontend URL, this returns
 * every host variant that should be treated as the same frontend, so either
 * works without extra configuration.
 *
 * For any host other than the localhost/127.0.0.1 pair (e.g. a production
 * domain) the single configured origin is returned unchanged.
 */
const LOOPBACK_HOST_ALIASES = ['localhost', '127.0.0.1'] as const

export function frontendOrigins(frontendUrl: string): string[] {
  const url = new URL(frontendUrl)
  const aliases = LOOPBACK_HOST_ALIASES.includes(
    url.hostname as (typeof LOOPBACK_HOST_ALIASES)[number],
  )
    ? LOOPBACK_HOST_ALIASES
    : [url.hostname]

  return aliases.map((hostname) => {
    const variant = new URL(frontendUrl)
    variant.hostname = hostname
    return variant.origin
  })
}

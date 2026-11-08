import type { ProviderSettings } from './provider.ts'
import { takesBaseUrl } from './provider.ts'

/**
 * Reads `LLM_ALLOWED_BASE_URLS`: origins (scheme, host, port) separated by commas. Anything
 * after the origin is ignored. Throws on an entry that is not an http(s) URL, so a typo stops
 * the server at boot instead of silently allowing nothing.
 */
export function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) return []
  const origins: string[] = []
  for (const entry of value.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const origin = httpOrigin(trimmed)
    if (!origin) throw new Error(`LLM_ALLOWED_BASE_URLS: "${trimmed}" is not an http(s) URL`)
    if (!origins.includes(origin)) origins.push(origin)
  }
  return origins
}

function httpOrigin(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.origin
}

/**
 * Why a provider's `baseUrl` is refused, or `null` when it is fine. Hosted providers have a
 * fixed URL and take none; the others need one whose origin is allowlisted. The URL may not
 * carry credentials, a query or a fragment.
 */
export function baseUrlProblem(
  provider: ProviderSettings,
  allowedOrigins: readonly string[],
): string | null {
  const baseUrl = provider.baseUrl ?? null
  if (!takesBaseUrl(provider.kind)) {
    return baseUrl === null ? null : `A ${provider.kind} provider takes no base URL`
  }
  if (baseUrl === null) return `A ${provider.kind} provider needs a base URL`
  const origin = httpOrigin(baseUrl)
  if (!origin) return 'The base URL must be an http(s) URL'
  const url = new URL(baseUrl)
  if (url.username || url.password || url.search || url.hash) {
    return 'The base URL cannot carry credentials, a query or a fragment'
  }
  if (!allowedOrigins.includes(origin)) {
    return `The base URL's origin (${origin}) is not in this server's allowlist (LLM_ALLOWED_BASE_URLS)`
  }
  return null
}

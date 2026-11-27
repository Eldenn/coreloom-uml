import { z } from 'zod'
import { HttpStatus } from '#app/shared/http/http-status'
import {
  WEB_SEARCH_LIMITS,
  type WebSearchAnswer,
  WebSearchFailure,
  type WebSearchKind,
  type WebSearchResult,
} from '#app/web-search/constants/web-search'

/** Linkup's endpoints (docs.linkup.so: `/v1/search` and `/v1/credits/balance`, both need the key). */
const LINKUP = {
  search: 'https://api.linkup.so/v1/search',
  balance: 'https://api.linkup.so/v1/credits/balance',
} as const

/** A `searchResults` answer: its items are read one by one, so one odd item drops only itself. */
const linkupBody = z.object({ results: z.array(z.unknown()) })

/** The fields read of one result; an image result has no `content`. */
const linkupResult = z.object({
  type: z.string(),
  name: z.string(),
  url: z.string().max(WEB_SEARCH_LIMITS.urlMaxLength),
  content: z.string().optional(),
  publishedAt: z.string().nullish(),
})

function isWebAddress(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * The first `WEB_SEARCH_LIMITS.results` text results of a Linkup `searchResults` answer whose
 * address is a web page within `urlMaxLength`, each cut to the limits (an item that does not read
 * is dropped); `null` when the body is not of that shape.
 */
export function readLinkupResults(body: unknown): WebSearchResult[] | null {
  const parsed = linkupBody.safeParse(body)
  if (!parsed.success) return null
  return parsed.data.results
    .flatMap((item) => {
      const result = linkupResult.safeParse(item)
      return result.success ? [result.data] : []
    })
    .filter((result) => result.type === 'text' && isWebAddress(result.url))
    .slice(0, WEB_SEARCH_LIMITS.results)
    .map((result) => ({
      title: result.name.slice(0, WEB_SEARCH_LIMITS.titleMaxLength),
      url: result.url,
      snippet: (result.content ?? '').slice(0, WEB_SEARCH_LIMITS.snippetMaxLength),
      publishedAt: result.publishedAt?.slice(0, WEB_SEARCH_LIMITS.publishedAtMaxLength) ?? null,
    }))
}

function failureOf(status: number): WebSearchFailure {
  if (status === HttpStatus.Unauthorized || status === HttpStatus.Forbidden) {
    return WebSearchFailure.Unauthorized
  }
  return status === HttpStatus.TooManyRequests
    ? WebSearchFailure.Quota
    : WebSearchFailure.Unavailable
}

/**
 * The web search service's client. It is given the key on each call and never keeps, logs or
 * throws it, nor the query; every failure is reduced to a `WebSearchFailure`.
 */
export default class WebSearch {
  /** One search of at most `WEB_SEARCH_LIMITS.results` pages, within `timeoutMs`. */
  async search(
    _kind: WebSearchKind,
    apiKey: string,
    query: string,
    signal?: AbortSignal,
  ): Promise<WebSearchAnswer> {
    const response = await this.#send(
      LINKUP.search,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          q: query,
          depth: 'fast',
          outputType: 'searchResults',
          maxResults: WEB_SEARCH_LIMITS.results,
        }),
      },
      apiKey,
      signal,
    )
    if ('failure' in response) return response
    if (response.status !== HttpStatus.Ok) {
      await response.body?.cancel()
      return { failure: failureOf(response.status) }
    }
    const results = readLinkupResults(await response.json().catch(() => null))
    return results ? { results } : { failure: WebSearchFailure.Unavailable }
  }

  /** Whether the key is accepted, asked of the balance endpoint (no search spent); null when it is. */
  async check(_kind: WebSearchKind, apiKey: string): Promise<WebSearchFailure | null> {
    const response = await this.#send(LINKUP.balance, { method: 'GET' }, apiKey)
    if ('failure' in response) return response.failure
    await response.body?.cancel()
    return response.status === HttpStatus.Ok ? null : failureOf(response.status)
  }

  async #send(
    url: string,
    init: RequestInit,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<Response | { failure: WebSearchFailure }> {
    const timeout = AbortSignal.timeout(WEB_SEARCH_LIMITS.timeoutMs)
    try {
      return await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${apiKey}` },
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (error) {
      const aborted =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
      return { failure: aborted ? WebSearchFailure.Timeout : WebSearchFailure.Unavailable }
    }
  }
}

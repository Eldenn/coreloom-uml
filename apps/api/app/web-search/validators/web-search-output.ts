import type { WebSearchKind } from '#app/web-search/constants/web-search'

/** The saved service as the admin screen shows it: its hint, never the key. */
export type WebSearchServiceOutput = { kind: WebSearchKind; keyHint: string; verifiedAt: string }

export type WebSearchOutput = { service: WebSearchServiceOutput | null }

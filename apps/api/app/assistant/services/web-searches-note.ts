const WEB_SEARCHES = { en: 'Web searches: ', fr: 'Recherches web : ' } as const

/** The reply with how many web searches the tools ran under it (a count, never a query). */
export function withSearches(reply: string, searches: number, locale: 'en' | 'fr'): string {
  return searches > 0 ? `${reply}\n\n_${WEB_SEARCHES[locale]}${String(searches)}_` : reply
}

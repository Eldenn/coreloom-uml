import type {
  WebSearchAnswer,
  WebSearchFailure,
  WebSearchKind,
  WebSearchResult,
} from '#app/web-search/constants/web-search'
import WebSearch, { type WebSearchOptions } from '#app/web-search/services/web-search'

/** `WebSearch` that never reaches the network: it answers what the test set and records queries. */
export class FakeWebSearch extends WebSearch {
  results: WebSearchResult[] = []
  failure: WebSearchFailure | null = null
  checkFailure: WebSearchFailure | null = null
  queries: string[] = []
  options: WebSearchOptions[] = []

  override async search(
    _kind: WebSearchKind,
    _apiKey: string,
    query: string,
    _signal?: AbortSignal,
    options: WebSearchOptions = {},
  ): Promise<WebSearchAnswer> {
    this.queries.push(query)
    this.options.push(options)
    return this.failure ? { failure: this.failure } : { results: this.results }
  }

  override async check(): Promise<WebSearchFailure | null> {
    return this.checkFailure
  }
}

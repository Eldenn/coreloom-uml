import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import WebSearch from '#app/web-search/services/web-search'
import {
  deleteWebSearch,
  savedWebSearch,
  saveWebSearch,
  type WebSearchSummary,
} from '#app/web-search/services/web-search-settings'
import { saveWebSearchInput } from '#app/web-search/validators/web-search-input'
import type { WebSearchOutput } from '#app/web-search/validators/web-search-output'

export const WEB_SEARCH_KEY_REFUSED = 'The web search service refused this key.'

function output(summary: WebSearchSummary | null): WebSearchOutput {
  if (!summary) return { service: null }
  const { kind, keyHint, verifiedAt } = summary
  return { service: { kind, keyHint, verifiedAt: verifiedAt.toUTC().toISO() ?? '' } }
}

/**
 * The instance's web search service, for the admin (`middleware.admin()`): see it, save it once
 * the service accepted its key, remove it. The key is never answered.
 */
export default class AdminWebSearchController {
  /** `GET /admin/web-search` */
  async show({ response }: HttpContext) {
    return response.ok(output(await savedWebSearch()))
  }

  /** `PUT /admin/web-search` `{ kind, apiKey }`: checked with the service first, then stored. */
  async update({ request, response }: HttpContext) {
    const { kind, apiKey } = await request.validateUsing(saveWebSearchInput)
    const webSearch = await app.container.make(WebSearch)
    const reason = await webSearch.check(kind, apiKey)
    if (reason) {
      return response.unprocessableEntity({ error: { message: WEB_SEARCH_KEY_REFUSED, reason } })
    }
    return response.ok(output(await saveWebSearch(kind, apiKey)))
  }

  /** `DELETE /admin/web-search` */
  async destroy({ response }: HttpContext) {
    await deleteWebSearch()
    return response.noContent()
  }
}

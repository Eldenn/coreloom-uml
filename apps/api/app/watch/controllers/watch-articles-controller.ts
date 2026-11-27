import type { HttpContext } from '@adonisjs/core/http'
import { isDefaultAccount } from '#app/auth/services/default-account'
import { paginate } from '#app/shared/pagination/paginate'
import { WATCH_NOT_FOUND } from '#app/watch/constants/watch'
import { serializeWatchArticle } from '#app/watch/serializers/watch-serializer'
import { watchArticlesQuery, watchEnabled } from '#app/watch/services/watch-query'
import { listWatchArticlesInput } from '#app/watch/validators/watch-input'
import type { WatchArticlesOutput } from '#app/watch/validators/watch-output'

/** The tech watch's articles, shared by the whole instance (behind `tech-watch`). */
export default class WatchArticlesController {
  async index({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await watchEnabled(user))) return response.notFound(WATCH_NOT_FOUND)
    const { page, perPage, hidden, ...filters } =
      await request.validateUsing(listWatchArticlesInput)
    // What the admin hid is the admin's to see.
    const query = watchArticlesQuery({ ...filters, hidden: hidden && isDefaultAccount(user) })
    const output: WatchArticlesOutput = await paginate(
      query,
      { page, perPage },
      serializeWatchArticle,
    )
    return response.ok(output)
  }
}

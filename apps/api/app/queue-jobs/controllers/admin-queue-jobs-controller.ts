import type { HttpContext } from '@adonisjs/core/http'
import { listQueueJobs } from '#app/queue-jobs/services/queue-jobs'

/** `GET /admin/jobs` (`middleware.admin()`): the background jobs running, waiting or just ended. */
export default class AdminQueueJobsController {
  async index({ response }: HttpContext) {
    return response.ok(await listQueueJobs())
  }
}

import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import { refreshWatch } from '#app/watch/services/watch-refresh'
import { releaseWatchRefresh } from '#app/watch/services/watch-refresh-lock'

/**
 * The daily run of the tech watch over every enabled feed (`refreshWatch`). Scheduled by
 * `node ace watch:setup`; the admin asks for one from the Watch page (`POST /admin/watch/refresh`).
 * The skill tagger then reads the new articles.
 */
export type RefreshWatchJobData = Record<string, never>

export default class RefreshWatchJob extends Job<RefreshWatchJobData, void> {
  static options: BullJobsOptions = {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5 * 60_000 },
  }

  async process(): Promise<void> {
    const report = await refreshWatch()
    this.logger.info({ report }, 'tech watch refreshed')
    if (report.added > 0) await ClassifySkillTopicsJob.dispatch({})
    await releaseWatchRefresh()
  }

  async onFailed(): Promise<void> {
    await releaseWatchRefresh()
    this.logger.error({ err: this.error }, 'tech watch refresh failed after all retries')
  }
}

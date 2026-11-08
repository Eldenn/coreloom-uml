import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { refreshCatalog } from '#app/skills/services/skills-catalog'
import { renderReport } from '#app/skills/services/skills-search'
import env from '#start/env'

/**
 * The weekly search that feeds the skills catalog (see `skills-catalog.ts`). Scheduled by
 * `node ace skills:setup` when SKILLS_REFRESH_ENABLED is true; `node ace skills:refresh` runs
 * the same search right away.
 */
export type RefreshSkillsJobData = Record<string, never>

export default class RefreshSkillsJob extends Job<RefreshSkillsJobData, void> {
  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  }

  async process(): Promise<void> {
    const report = await refreshCatalog({ githubToken: env.get('SKILLS_GITHUB_TOKEN') })
    this.logger.info({ report }, `skills catalog refreshed: ${renderReport(report)}`)
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error }, 'skills catalog refresh failed after all retries')
  }
}

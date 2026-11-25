import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { queueSkillScans } from '#app/skills/services/skill-scans'
import { captureSkillVersions } from '#app/skills/services/skill-versions'
import SkillsEvents from '#app/skills/services/skills-events'
import env from '#start/env'

/**
 * Copies one skill's files now, when the admin asks for it on the Skills screen
 * (`POST /admin/skill-versions`), instead of at the next weekly search: the same copy, under the
 * same conditions (`captureSkillVersions`), `pending` until the admin approves it.
 */
export type CaptureSkillVersionJobData = {
  slug: string
}

export default class CaptureSkillVersionJob extends Job<CaptureSkillVersionJobData, void> {
  static options: BullJobsOptions = {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  }

  async process(): Promise<void> {
    const report = await captureSkillVersions({
      slug: this.data.slug,
      githubToken: env.get('SKILLS_GITHUB_TOKEN'),
    })
    this.logger.info({ report }, 'skill copy asked by the admin')
    if (report.captured.length === 0) return
    await queueSkillScans()
    // Open Skills screens reload (see `GET /skills/events`).
    await (await app.container.make(SkillsEvents)).publish('catalog.updated')
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error, slug: this.data.slug }, 'skill copy failed')
  }
}

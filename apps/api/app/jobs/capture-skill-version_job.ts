import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import { queueSkillScans } from '#app/skills/services/skill-scans'
import { syncSkill } from '#app/skills/services/skills-catalog'
import SkillsEvents from '#app/skills/services/skills-events'
import env from '#start/env'

/**
 * Syncs one skill now, when the admin asks for it on the Skills screen
 * (`POST /admin/skill-versions`), instead of at the next weekly search (`syncSkill`): its audits
 * and its pin are read again, then its files are copied under the same conditions
 * (`captureSkillVersions`), `pending` until the admin approves the copy.
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
    const report = await syncSkill(this.data.slug, { githubToken: env.get('SKILLS_GITHUB_TOKEN') })
    // Deleted since the admin asked.
    if (!report) return
    this.logger.info({ report }, 'skill sync asked by the admin')
    if (report.copied.length > 0) await queueSkillScans()
    // Its pin or its eligibility may have changed: it is tagged and scored at the tagger's run.
    await ClassifySkillTopicsJob.dispatch({})
    // Open Skills screens reload (see `GET /skills/events`).
    await (await app.container.make(SkillsEvents)).publish('catalog.updated')
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error, slug: this.data.slug }, 'skill sync failed')
  }
}

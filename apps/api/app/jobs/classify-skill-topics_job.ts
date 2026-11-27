import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { SKILL_TOPICS_QUEUE } from '#app/skills/constants/skill-topics'
import { classifySkillTopics } from '#app/skills/services/skill-topics'
import SkillsEvents from '#app/skills/services/skills-events'
import { classifyWatchArticles } from '#app/watch/services/watch-topics'

/**
 * Embeds the new and changed skills, then tags the catalog from every label
 * (`classifySkillTopics`), queued after each skills refresh and each tag the admin sets. Its queue
 * is listened to by the `skill-tagger` worker only, the one image that can load the model (see
 * `SkillEmbedder`), one run at a time; a run with no new text takes a few seconds. `node ace
 * skills:classify` runs the same right away.
 */
export type ClassifySkillTopicsJobData = Record<string, never>

export default class ClassifySkillTopicsJob extends Job<ClassifySkillTopicsJobData, void> {
  static defaultQueue = SKILL_TOPICS_QUEUE

  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5 * 60_000 },
  }

  async process(): Promise<void> {
    const report = await classifySkillTopics()
    this.logger.info({ report }, 'skills tagged')
    // The tech watch's articles are tagged by the same model, here only (see `watch-topics.ts`).
    const articles = await classifyWatchArticles()
    this.logger.info({ report: articles }, 'watch articles tagged')
    if (report.tagged > 0) {
      await (await app.container.make(SkillsEvents)).publish('catalog.updated')
    }
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error }, 'skills tagging failed after all retries')
  }
}

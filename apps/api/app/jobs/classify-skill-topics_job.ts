import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { SKILL_TOPICS_QUEUE } from '#app/skills/constants/skill-topics'
import SkillEmbedder from '#app/skills/services/skill-embedder'
import { scoreSkillRules } from '#app/skills/services/skill-rule-scores'
import { classifySkillTopics } from '#app/skills/services/skill-topics'
import SkillsEvents from '#app/skills/services/skills-events'
import { classifyWatchArticles } from '#app/watch/services/watch-topics'

/**
 * Reads the catalog with the model, loaded once: the skills' classification vectors and their
 * tags (`classifySkillTopics`), then the search vectors and the skill–rule scores
 * (`scoreSkillRules`), then the watch's articles (`classifyWatchArticles`). The tags come before
 * the search, and the search asks for no tag. Queued after each skills refresh, each tag the
 * admin sets, each copy captured and each skill suggested again, and by `node ace
 * skills:classify` and `skills:setup`. Its queue is listened to by the `skill-tagger` worker
 * only, the one image that can load the model (see `SkillEmbedder`), one run at a time; a run
 * with no new text takes a few seconds.
 */
export type ClassifySkillTopicsJobData = Record<string, never>

export default class ClassifySkillTopicsJob extends Job<ClassifySkillTopicsJobData, void> {
  static defaultQueue = SKILL_TOPICS_QUEUE

  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5 * 60_000 },
  }

  async process(): Promise<void> {
    const embedder = await app.container.make(SkillEmbedder)
    try {
      const report = await classifySkillTopics({ embedder })
      this.logger.info({ report }, 'skills tagged')
      const scores = await scoreSkillRules({ embedder })
      this.logger.info({ report: scores }, 'skills scored against the rules')
      // The tech watch's articles are tagged by the same model, here only (see `watch-topics.ts`).
      const articles = await classifyWatchArticles({ embedder })
      this.logger.info({ report: articles }, 'watch articles tagged')
      if (report.tagged > 0 || scores.embeddedSkills > 0 || scores.embeddedRules > 0) {
        await (await app.container.make(SkillsEvents)).publish('catalog.updated')
      }
    } finally {
      await embedder.close()
    }
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error }, 'skills tagging failed after all retries')
  }
}

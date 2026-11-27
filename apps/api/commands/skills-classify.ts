import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * Queues a tagger run (`ClassifySkillTopicsJob`) rather than running it here: only the
 * `skill-tagger` worker loads the model, one run at a time, so a command started in its container
 * never loads a second one beside it (2.4 GB in fp32).
 */
export default class SkillsClassify extends BaseCommand {
  static commandName = 'skills:classify'
  static description =
    'Queue a tagger run: tag the catalog and score the skills against the rules (the refresh and the admin queue the same)'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: ClassifySkillTopicsJob } = await import('#app/jobs/classify-skill-topics_job')
    try {
      await ClassifySkillTopicsJob.dispatch({})
      this.logger.success('tagger run queued: the skill-tagger worker runs it')
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }
}

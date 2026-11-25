import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SkillsClassify extends BaseCommand {
  static commandName = 'skills:classify'
  static description =
    'Embed the new and changed skills and tag the catalog, now (the refresh and the admin queue the same)'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { classifySkillTopics } = await import('#app/skills/services/skill-topics')
    const { default: SkillsEvents } = await import('#app/skills/services/skills-events')
    try {
      const report = await classifySkillTopics({
        onProgress: (message) => this.logger.info(message),
      })
      if (report.labels === 0) {
        this.logger.warning('too few labels to learn from: the skills keep their search tags')
        return
      }
      await (await this.app.container.make(SkillsEvents)).publish('catalog.updated')
      this.logger.success(
        `${report.embedded} skills read, ${report.labels} labels learnt, ${report.tagged} skills retagged, ${report.skipped} too short to read`,
      )
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }
}

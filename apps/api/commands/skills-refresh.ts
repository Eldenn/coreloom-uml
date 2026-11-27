import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SkillsRefresh extends BaseCommand {
  static commandName = 'skills:refresh'
  static description = 'Read every enabled skill source now and update the skills catalog'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: env } = await import('#start/env')
    const { refreshCatalog } = await import('#app/skills/services/skills-catalog')
    const { renderReport } = await import('#app/skills/services/skills-search')
    const { default: SkillsEvents } = await import('#app/skills/services/skills-events')
    try {
      const report = await refreshCatalog({
        githubToken: env.get('SKILLS_GITHUB_TOKEN'),
        onProgress: (message) => this.logger.info(message),
      })
      await (await this.app.container.make(SkillsEvents)).publish('catalog.refreshed')
      this.logger.success(renderReport(report))
      const { queueSkillScans } = await import('#app/skills/services/skill-scans')
      this.logger.info(`${await queueSkillScans()} copies queued for a scan (skill-scanner worker)`)
      const { default: ClassifySkillTopicsJob } = await import(
        '#app/jobs/classify-skill-topics_job'
      )
      await ClassifySkillTopicsJob.dispatch({})
      this.logger.info('skills queued for the tagger')
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }
}

import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SkillsRefresh extends BaseCommand {
  static commandName = 'skills:refresh'
  static description = 'Run the skills.sh search now and update the skills catalog'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: env } = await import('#start/env')
    const { refreshCatalog } = await import('#app/skills/services/skills-catalog')
    const { renderReport } = await import('#app/skills/services/skills-search')
    try {
      const report = await refreshCatalog({ githubToken: env.get('SKILLS_GITHUB_TOKEN') })
      this.logger.success(renderReport(report))
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error))
      this.exitCode = 1
    }
  }
}

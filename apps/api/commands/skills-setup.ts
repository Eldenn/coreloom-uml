import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class SkillsSetup extends BaseCommand {
  static commandName = 'skills:setup'
  static description =
    'Copy the hand-picked skills into the catalog and schedule the weekly skills.sh search'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { default: env } = await import('#start/env')
    const { syncManualSkills } = await import('#app/skills/services/skills-catalog')
    const { SKILLS_REFRESH_SCHEDULE } = await import('#app/skills/constants/skill')
    const { JobScheduler } = await import('@nemoventures/adonis-jobs')
    const { default: RefreshSkillsJob } = await import('#app/jobs/refresh-skills_job')

    const count = await syncManualSkills()
    this.logger.success(`${count} hand-picked skills in the catalog`)

    if (env.get('SKILLS_REFRESH_ENABLED')) {
      await JobScheduler.schedule({
        key: SKILLS_REFRESH_SCHEDULE.key,
        repeat: { pattern: SKILLS_REFRESH_SCHEDULE.pattern, tz: 'UTC' },
        job: RefreshSkillsJob,
        data: {},
      })
      this.logger.success(`skills.sh search scheduled (${SKILLS_REFRESH_SCHEDULE.pattern} UTC)`)
    } else if (await JobScheduler.remove(SKILLS_REFRESH_SCHEDULE.key)) {
      this.logger.info('SKILLS_REFRESH_ENABLED is off: the skills.sh search is no longer scheduled')
    } else {
      this.logger.info('SKILLS_REFRESH_ENABLED is off: the skills.sh search is not scheduled')
    }
  }
}

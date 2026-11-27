import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class WatchSetup extends BaseCommand {
  static commandName = 'watch:setup'
  static description = 'Schedule the daily tech watch run over the feeds the admin picked'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { WATCH_REFRESH_SCHEDULE } = await import('#app/watch/constants/watch')
    const { JobScheduler } = await import('@nemoventures/adonis-jobs')
    const { default: RefreshWatchJob } = await import('#app/jobs/refresh-watch_job')
    await JobScheduler.schedule({
      key: WATCH_REFRESH_SCHEDULE.key,
      repeat: { pattern: WATCH_REFRESH_SCHEDULE.pattern, tz: 'UTC' },
      job: RefreshWatchJob,
      data: {},
    })
    this.logger.success(`tech watch scheduled (${WATCH_REFRESH_SCHEDULE.pattern} UTC)`)
  }
}

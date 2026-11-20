import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

export default class AssistantSetup extends BaseCommand {
  static commandName = 'assistant:setup'
  static description = 'Schedule the daily prune of idle assistant repository sandboxes'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const { SANDBOX_PRUNE_SCHEDULE } = await import('#app/assistant/constants/repository')
    const { JobScheduler } = await import('@nemoventures/adonis-jobs')
    const { default: PruneAssistantSandboxesJob } = await import(
      '#app/jobs/prune-assistant-sandboxes_job'
    )
    await JobScheduler.schedule({
      key: SANDBOX_PRUNE_SCHEDULE.key,
      repeat: { pattern: SANDBOX_PRUNE_SCHEDULE.pattern, tz: 'UTC' },
      job: PruneAssistantSandboxesJob,
      data: {},
    })
    this.logger.success(`sandbox prune scheduled (${SANDBOX_PRUNE_SCHEDULE.pattern} UTC)`)
  }
}

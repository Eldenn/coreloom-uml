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

    // The template repository sandboxes start from (git and graphify): built once per install.
    // A failure is logged, never fatal: the API must start while E2B is down, and code maps
    // from GitHub and the assistant's repository tools answer "unavailable" until it is built.
    const { REPOSITORY_TEMPLATE_NAME } = await import('#app/assistant/constants/repository')
    const { default: RepositorySandbox } = await import(
      '#app/assistant/services/repository-sandbox'
    )
    try {
      const state = await (await this.app.container.make(RepositorySandbox)).ensureTemplate()
      if (state) this.logger.success(`sandbox template ${REPOSITORY_TEMPLATE_NAME} ${state}`)
      else this.logger.warning('E2B_API_KEY is not set: no sandbox template, no GitHub import')
    } catch (error) {
      this.logger.error(`sandbox template ${REPOSITORY_TEMPLATE_NAME} could not be built`)
      this.logger.error((error as Error).message)
    }
  }
}

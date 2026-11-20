import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { DateTime } from 'luxon'
import { REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import { killSandboxes } from '#app/assistant/services/repository-session'

/**
 * Kills the repository sandboxes of the assistant unused for `REPOSITORY_SANDBOX.maxIdleDays`
 * and deletes their rows: a clone never outlives that. Scheduled daily by `node ace assistant:setup`.
 */
export type PruneAssistantSandboxesJobData = Record<string, never>

export default class PruneAssistantSandboxesJob extends Job<PruneAssistantSandboxesJobData, void> {
  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
  }

  async process(): Promise<void> {
    const idle = await AssistantSandbox.query().where(
      'lastUsedAt',
      '<',
      DateTime.now().minus({ days: REPOSITORY_SANDBOX.maxIdleDays }).toSQL() ?? '',
    )
    await killSandboxes(idle)
    if (idle.length > 0) {
      await AssistantSandbox.query()
        .whereIn(
          'id',
          idle.map((row) => row.id),
        )
        .delete()
    }
    this.logger.info({ count: idle.length }, 'idle assistant sandboxes pruned')
  }
}

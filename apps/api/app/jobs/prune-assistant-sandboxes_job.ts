import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { DateTime } from 'luxon'
import { ASSISTANT_SANDBOX_METADATA, REPOSITORY_SANDBOX } from '#app/assistant/constants/repository'
import AssistantSandbox from '#app/assistant/models/assistant-sandbox'
import RepositorySandbox from '#app/assistant/services/repository-sandbox'
import { killSandboxes } from '#app/assistant/services/repository-session'

/**
 * Kills the repository sandboxes of the assistant unused for `REPOSITORY_SANDBOX.maxIdleDays`
 * and deletes their rows: a clone never outlives that. Then kills every paused sandbox of a
 * conversation (`ASSISTANT_SANDBOX_METADATA`) that has no row: the API died between its creation
 * and its row, which may have left the clone's credential file in it. A sandbox being cloned is
 * still running, never paused, so it is left alone. Scheduled daily by `node ace assistant:setup`.
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
    const orphans = await this.killOrphans()
    this.logger.info({ count: idle.length, orphans }, 'idle assistant sandboxes pruned')
  }

  /** Kills the paused sandboxes of a conversation that have no row: how many, null unlisted. */
  private async killOrphans(): Promise<number | null> {
    const sandboxes = await app.container.make(RepositorySandbox)
    // Listed before the rows are read: a row written meanwhile is a running sandbox's.
    const paused = await sandboxes.listPaused({ ...ASSISTANT_SANDBOX_METADATA })
    if (!paused) return null
    if (paused.length === 0) return 0
    const kept = await AssistantSandbox.query().whereIn('sandboxId', paused).select('sandboxId')
    const known = new Set(kept.map((row) => row.sandboxId))
    const orphans = paused.filter((id) => !known.has(id))
    await Promise.all(orphans.map((id) => sandboxes.kill(id)))
    return orphans.length
  }
}

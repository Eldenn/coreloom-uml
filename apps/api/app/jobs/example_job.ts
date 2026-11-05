import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'

/**
 * Reference background job — copy this when adding a real one.
 *
 * The filename MUST end in `_job.ts`: the worker's job discovery
 * (@nemoventures/adonis-jobs) scans `app/**` for that exact suffix. This is a
 * library-mandated exception to the repo's no-underscore filename rule, like
 * the `<timestamp>_` prefix on migrations.
 *
 * A job is a class with a typed payload and a `process()` method. Dispatch it
 * with `ExampleJob.dispatch({ label: '...' })` from a controller/service; the
 * `queue:work` worker picks it up. Nothing dispatches this one yet — the first
 * real candidates are the `mail.sendLater()` call sites in
 * `app/auth/controllers/*` and `app/account/controllers/update-profile-controller.ts`.
 */
export type ExampleJobData = {
  label: string
}

export default class ExampleJob extends Job<ExampleJobData, void> {
  static options: BullJobsOptions = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  }

  async process(): Promise<void> {
    this.logger.info({ label: this.data.label }, 'ExampleJob processed')
  }
}

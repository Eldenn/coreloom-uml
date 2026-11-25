import app from '@adonisjs/core/services/app'
import { Job } from '@nemoventures/adonis-jobs'
import type { BullJobsOptions } from '@nemoventures/adonis-jobs/types'
import { SKILL_SCANS_QUEUE, SkillScanStatus } from '#app/skills/constants/skill-scan'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import SkillVersion from '#app/skills/models/skill-version'
import { scanSkillVersion } from '#app/skills/services/skill-scans'
import SkillsEvents from '#app/skills/services/skills-events'

/**
 * Scans one copy of a skill with SkillSpector (`scanSkillVersion`), queued by each skills refresh
 * for the pending copies without a verdict (`queueSkillScans`). Its queue is listened to by the
 * `skill-scanner` worker only, the one image that holds the binary: never add `skill-scans` to
 * the `queue-worker`'s queues.
 */
export type ScanSkillVersionJobData = {
  skillVersionId: number
  /** Scan again a copy that has a verdict (the admin asked, `POST /admin/skill-versions/:id/scan`). */
  force?: boolean
}

export default class ScanSkillVersionJob extends Job<ScanSkillVersionJobData, void> {
  static defaultQueue = SKILL_SCANS_QUEUE

  static options: BullJobsOptions = {
    // A scan that gives no verdict is stored as `failed`, not thrown: only reading the copy from
    // Drive or saving the row can fail here, and those are worth one more try.
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  }

  async process(): Promise<void> {
    const version = await SkillVersion.find(this.data.skillVersionId)
    // Deleted with its skill, already decided, or scanned meanwhile: nothing to do.
    if (!version || version.status !== SkillVersionStatus.Pending) return
    if (version.scan?.status === SkillScanStatus.Done && !this.data.force) return
    const scan = await scanSkillVersion(version)
    this.logger.info(
      {
        skillVersionId: version.id,
        status: scan.status,
        ...(scan.status === SkillScanStatus.Done
          ? { score: scan.score, findings: scan.findings.length + scan.moreFindings }
          : { reason: scan.reason }),
      },
      'skill copy scanned',
    )
    // Open Skills screens reload (see `GET /skills/events`).
    await (await app.container.make(SkillsEvents)).publish('catalog.updated')
  }

  async onFailed(): Promise<void> {
    this.logger.error({ err: this.error }, 'skill copy scan failed after all retries')
  }
}

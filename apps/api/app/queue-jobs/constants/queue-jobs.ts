import { CODE_MAPS_QUEUE } from '#app/code-maps/constants/code-map'
import { SKILL_SCANS_QUEUE } from '#app/skills/constants/skill-scan'
import { SKILL_TOPICS_QUEUE } from '#app/skills/constants/skill-topics'

/** Every queue of `config/queue.ts`: the admin's view of the jobs reads them all. */
export const WATCHED_QUEUES = [
  'default',
  CODE_MAPS_QUEUE,
  SKILL_SCANS_QUEUE,
  SKILL_TOPICS_QUEUE,
] as const

/** What the admin's view says of a job (BullMQ's waiting, delayed and prioritized are all `queued`). */
export const QueueJobStatus = {
  Queued: 'queued',
  Running: 'running',
  Done: 'done',
  Failed: 'failed',
} as const
export type QueueJobStatus = (typeof QueueJobStatus)[keyof typeof QueueJobStatus]

export const QUEUE_JOBS_LIMITS = {
  /** Jobs read per queue and state: past it, the rest are only counted (`hidden`). */
  perQueueState: 20,
  /** How long a finished job stays in the view, so the admin sees how it ended. */
  recentMs: 10 * 60_000,
} as const

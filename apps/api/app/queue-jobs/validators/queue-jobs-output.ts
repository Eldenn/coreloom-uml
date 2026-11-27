import type { QueueJobStatus } from '#app/queue-jobs/constants/queue-jobs'

/** One job of a queue as the admin's view shows it: never its data, which may hold an address or an id. */
export type QueueJobOutput = {
  /** `<queue>:<BullMQ id>`, unique across queues. */
  id: string
  queue: string
  /** The job class (`RefreshSkillsJob`…), which the web turns into words. */
  name: string
  status: QueueJobStatus
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
  attempts: number
}

export type QueueJobsOutput = {
  jobs: QueueJobOutput[]
  /** Queued jobs past `QUEUE_JOBS_LIMITS.perQueueState`, counted but not listed. */
  hidden: number
}

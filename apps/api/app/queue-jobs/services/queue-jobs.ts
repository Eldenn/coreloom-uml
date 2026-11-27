import queue from '@nemoventures/adonis-jobs/services/main'
import type { Job as BullJob } from 'bullmq'
import SendMailJob from '#app/jobs/send-mail_job'
import {
  QUEUE_JOBS_LIMITS,
  QueueJobStatus,
  WATCHED_QUEUES,
} from '#app/queue-jobs/constants/queue-jobs'
import type { QueueJobOutput, QueueJobsOutput } from '#app/queue-jobs/validators/queue-jobs-output'

/** Mail is sent for every account and says nothing about the work the admin launched. */
const SKIPPED = new Set<string>([SendMailJob.jobName])

const QUEUED_STATES = ['waiting', 'delayed', 'prioritized'] as const

function iso(time: number | undefined): string | null {
  return time ? new Date(time).toISOString() : null
}

function serialize(name: string, job: BullJob, status: QueueJobStatus): QueueJobOutput {
  return {
    id: `${name}:${job.id ?? ''}`,
    queue: name,
    name: job.name,
    status,
    queuedAt: new Date(job.timestamp).toISOString(),
    startedAt: iso(job.processedOn),
    finishedAt: iso(job.finishedOn),
    attempts: job.attemptsMade,
  }
}

async function readQueue(name: (typeof WATCHED_QUEUES)[number], now: number) {
  const bull = queue.useQueue(name)
  const end = QUEUE_JOBS_LIMITS.perQueueState - 1
  const [active, queued, done, failed, counts] = await Promise.all([
    bull.getJobs(['active'], 0, end),
    bull.getJobs([...QUEUED_STATES], 0, end, true),
    bull.getJobs(['completed'], 0, end),
    bull.getJobs(['failed'], 0, end),
    bull.getJobCounts(...QUEUED_STATES),
  ])
  const recent = (job: BullJob) => (job.finishedOn ?? 0) >= now - QUEUE_JOBS_LIMITS.recentMs
  // A scheduled job's next run waits in the queue until its time: nobody launched it yet.
  const launched = (job: BullJob) => !job.repeatJobKey || job.timestamp + job.delay <= now
  const jobs = [
    ...active.map((job) => serialize(name, job, QueueJobStatus.Running)),
    ...queued.filter(launched).map((job) => serialize(name, job, QueueJobStatus.Queued)),
    ...done.filter(recent).map((job) => serialize(name, job, QueueJobStatus.Done)),
    ...failed.filter(recent).map((job) => serialize(name, job, QueueJobStatus.Failed)),
  ].filter((job) => !SKIPPED.has(job.name))
  const waiting = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return { jobs, hidden: Math.max(0, waiting - queued.length) }
}

/**
 * The jobs of every queue that run, wait, or ended in the last minutes: what the admin's header
 * shows after launching one. Reads BullMQ only, never a job's data.
 */
export async function listQueueJobs(now = Date.now()): Promise<QueueJobsOutput> {
  const queues = await Promise.all(WATCHED_QUEUES.map((name) => readQueue(name, now)))
  return {
    jobs: queues.flatMap((q) => q.jobs),
    hidden: queues.reduce((sum, q) => sum + q.hidden, 0),
  }
}

// The admin's jobs as the header's background tasks (pure, so it is tested without a browser).
import type { BackgroundTask } from '@/components/background-tasks'
import type { QueueJob, QueueJobs } from '@/lib/queue-jobs'
import type { Messages } from '@/messages'

type JobsMessages = Messages['jobs']

function toTask(job: QueueJob, t: JobsMessages): BackgroundTask {
  return {
    id: job.id,
    label: t.names[job.name] ?? job.name,
    status: job.status,
    // A job tried again after a failure says which attempt this is.
    detail: job.attempts > 0 && job.status !== 'done' ? t.retry(job.attempts + 1) : undefined,
    startedAt: job.startedAt ?? job.queuedAt,
    finishedAt: job.finishedAt ?? undefined,
  }
}

export function toTasks(data: QueueJobs, t: JobsMessages): BackgroundTask[] {
  const tasks = data.jobs.map((job) => toTask(job, t))
  if (data.hidden > 0) tasks.push({ id: 'more', label: t.more(data.hidden), status: 'queued' })
  return tasks
}

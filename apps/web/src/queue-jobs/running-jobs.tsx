// The admin's background jobs in the header: what runs, waits or ended in the last minutes, read
// from `GET /admin/jobs`. The panel opens by itself when a screen queues a job (`jobLaunched`).
import { BackgroundTasks } from '@/components/background-tasks'
import { useT } from '@/lib/locale'
import { useJobsPanel, useQueueJobs } from '@/lib/queue-jobs'
import { toTasks } from '@/queue-jobs/job-tasks'

export function RunningJobs() {
  const t = useT().jobs
  const [open, setOpen] = useJobsPanel()
  const { data } = useQueueJobs(true)
  return <BackgroundTasks tasks={data ? toTasks(data, t) : []} open={open} onOpenChange={setOpen} />
}

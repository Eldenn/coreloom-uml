// The admin's background jobs (`GET /admin/jobs`): what runs, waits or just ended, shown in the
// header. A screen that queues a job calls `jobLaunched()`, which reloads the list at once and
// opens the header's panel, so the job is seen from its start rather than through a toast only.
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { client } from '@/lib/client'
import { queryClient } from '@/lib/query'

export type QueueJobs = Awaited<ReturnType<typeof client.api.admin.jobs.index>>
export type QueueJob = QueueJobs['jobs'][number]

export const queueJobsKey = ['admin', 'jobs'] as const

/** While a job runs or waits, the list is read again this often; otherwise rarely (the weekly run). */
const BUSY_POLL_MS = 2_000
const IDLE_POLL_MS = 30_000

export function isBusy(job: QueueJob): boolean {
  return job.status === 'queued' || job.status === 'running'
}

export function useQueueJobs(enabled: boolean) {
  return useQuery({
    queryKey: queueJobsKey,
    queryFn: () => client.api.admin.jobs.index({}),
    enabled,
    refetchInterval: (query) => (query.state.data?.jobs.some(isBusy) ? BUSY_POLL_MS : IDLE_POLL_MS),
  })
}

// The panel's open state, shared between the header that shows it and the screens that launch jobs.
let open = false
const listeners = new Set<() => void>()

function setJobsPanelOpen(next: boolean) {
  open = next
  for (const listener of listeners) listener()
}

export function useJobsPanel() {
  const isOpen = React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open,
  )
  return [isOpen, setJobsPanelOpen] as const
}

/** A job was just queued: show it now. */
export function jobLaunched() {
  void queryClient.invalidateQueries({ queryKey: queueJobsKey })
  setJobsPanelOpen(true)
}

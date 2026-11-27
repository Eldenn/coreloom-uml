// The admin's background jobs (`GET /admin/jobs`): what runs, waits or just ended, shown in the
// header. A screen that queues a job calls `jobLaunched()`, which reloads the list at once and
// opens the header's panel, so the job is seen from its start rather than through a toast only.
// When a job seen running or waiting ends, what it changed is read again (`refreshedBy`).
import { useQuery } from '@tanstack/react-query'
import * as React from 'react'

import { assistantKeys } from '@/lib/assistant'
import { client } from '@/lib/client'
import { codeMapKeys } from '@/lib/code-maps'
import { githubKeys } from '@/lib/github'
import { projectKeys } from '@/lib/projects'
import { queryClient } from '@/lib/query'
import { skillKeys, skillSourceKeys } from '@/lib/skills'
import { watchKeys } from '@/lib/watch'
import { endedJobs, isBusy } from '@/queue-jobs/job-tasks'

export type QueueJobs = Awaited<ReturnType<typeof client.api.admin.jobs.index>>
export type QueueJob = QueueJobs['jobs'][number]

export const queueJobsKey = ['admin', 'jobs'] as const

/** While a job runs or waits, the list is read again this often; otherwise rarely (the weekly run). */
const BUSY_POLL_MS = 2_000
const IDLE_POLL_MS = 30_000

/** What each job changes, read again once it ends (the screens open on it refetch at once). */
function refreshedBy(name: string): readonly (readonly unknown[])[] {
  switch (name) {
    case 'RefreshSkillsJob':
    case 'CaptureSkillVersionJob':
      return [skillKeys.all, skillSourceKeys.all]
    case 'ScanSkillVersionJob':
      return [skillKeys.all]
    case 'ClassifySkillTopicsJob':
      return [skillKeys.all, watchKeys.all]
    case 'RefreshWatchJob':
      return [watchKeys.all]
    case 'ImportGithubCodeMapJob':
    case 'FollowGithubPushJob':
      return [codeMapKeys.all, projectKeys.all, githubKeys.follows]
    case 'PruneAssistantSandboxesJob':
      return [assistantKeys.all]
    default:
      return []
  }
}

async function readJobs(): Promise<QueueJobs> {
  const before = queryClient.getQueryData<QueueJobs>(queueJobsKey)
  const after = await client.api.admin.jobs.index({})
  const keys = new Set(endedJobs(before, after).flatMap(refreshedBy))
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
  return after
}

export function useQueueJobs(enabled: boolean) {
  return useQuery({
    queryKey: queueJobsKey,
    queryFn: readJobs,
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

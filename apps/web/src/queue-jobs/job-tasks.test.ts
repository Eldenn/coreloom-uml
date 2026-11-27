import { describe, expect, it } from 'vitest'

import type { QueueJob } from '@/lib/queue-jobs'
import { en } from '@/messages'
import { endedJobs, toTasks } from '@/queue-jobs/job-tasks'

const job: QueueJob = {
  id: 'default:1',
  queue: 'default',
  name: 'RefreshSkillsJob',
  status: 'running',
  queuedAt: '2026-11-27T10:00:00.000Z',
  startedAt: '2026-11-27T10:00:05.000Z',
  finishedAt: null,
  attempts: 0,
}

describe('toTasks', () => {
  it('names known jobs, keeps unknown names, says the attempt and counts the hidden ones', () => {
    const tasks = toTasks(
      {
        jobs: [job, { ...job, id: 'default:2', name: 'NewJob', status: 'queued', attempts: 1 }],
        hidden: 3,
      },
      en.jobs,
    )
    expect(tasks).toEqual([
      expect.objectContaining({ label: 'Skills catalog search', detail: undefined }),
      expect.objectContaining({ label: 'NewJob', detail: 'Attempt 2' }),
      { id: 'more', label: '3 more jobs waiting', status: 'queued' },
    ])
  })
})

describe('endedJobs', () => {
  it('names the jobs seen busy that have ended since, and nothing on the first read', () => {
    const done = { ...job, status: 'done' as const }
    const failed = {
      ...job,
      id: 'default:2',
      name: 'ScanSkillVersionJob',
      status: 'failed' as const,
    }
    const before = { jobs: [job, { ...failed, status: 'queued' as const }], hidden: 0 }
    expect(endedJobs(before, { jobs: [done, failed], hidden: 0 })).toEqual([
      'RefreshSkillsJob',
      'ScanSkillVersionJob',
    ])
    expect(endedJobs(undefined, { jobs: [done], hidden: 0 })).toEqual([])
    expect(endedJobs({ jobs: [done], hidden: 0 }, { jobs: [done], hidden: 0 })).toEqual([])
  })
})

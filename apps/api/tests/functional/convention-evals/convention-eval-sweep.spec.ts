import type { Logger } from '@adonisjs/core/logger'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { EvalFailureReason, EvalRunStatus } from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import PruneConventionEvalSandboxesJob from '#app/jobs/prune-convention-eval-sandboxes_job'
import User from '#app/users/models/user'
import { FakeEvalSandboxes } from '#tests/helpers/fake-eval-sandbox'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000)

async function sweep() {
  const job = new PruneConventionEvalSandboxesJob()
  job.data = {}
  job.logger = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger
  await job.process()
}

test.group('Convention tests - the sweep', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('kills the old sandboxes of the tests, running or paused, driven by E2B list', async ({
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      sandboxes.listed = [
        // Ours, old: killed.
        {
          sandboxId: 'old-ours',
          metadata: { 'coreloom.purpose': 'convention-evals', 'coreloom.run': '1' },
          startedAt: minutesAgo(55),
        },
        // Harbor's without our metadata, old: killed.
        {
          sandboxId: 'old-harbor',
          metadata: { 'harbor.job_id': 'job-1' },
          startedAt: minutesAgo(70),
        },
        // Ours, still young: kept.
        {
          sandboxId: 'young-ours',
          metadata: { 'coreloom.purpose': 'convention-evals' },
          startedAt: minutesAgo(10),
        },
        // Another feature's sandbox, old: kept.
        { sandboxId: 'assistant', metadata: { purpose: 'assistant' }, startedAt: minutesAgo(600) },
      ]
      await sweep()
      assert.sameMembers(sandboxes.killed, ['old-ours', 'old-harbor'])
    } finally {
      sandboxes.restore()
    }
  })

  test('ends the runs a dead worker left behind past their hard limit', async ({ assert }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await User.create({
        email: `sweep-${Math.random().toString(36).slice(2)}@example.com`,
        password: 'a-very-strong-passphrase',
      })
      const config = await AgentConfig.create({
        userId: user.id,
        projectId: null,
        name: 'Swept',
        targets: ['generic'],
        notes: null,
        revision: 1,
      })
      const make = (status: EvalRunStatus, createdAt: DateTime) =>
        ConventionEvalRun.create({
          userId: user.id,
          agentConfigId: config.id,
          path: 'harness',
          agent: 'harness',
          providerKind: 'mistral',
          model: 'mistral-small-2603',
          status,
          failureReason: null,
          capUsd: 5,
          estimateLowUsd: null,
          estimateHighUsd: null,
          pricesCheckedOn: '2026-11-27',
          costUsd: null,
          inputTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          trialCount: 6,
          configRevision: 1,
          catalogVersion: '0.19.0',
          startedAt: null,
          endedAt: null,
          createdAt,
        })
      const stale = await make(EvalRunStatus.Running, DateTime.now().minus({ hours: 3 }))
      const fresh = await make(EvalRunStatus.Running, DateTime.now().minus({ minutes: 5 }))
      const ended = await make(EvalRunStatus.Done, DateTime.now().minus({ hours: 3 }))

      await sweep()

      await stale.refresh()
      await fresh.refresh()
      await ended.refresh()
      assert.equal(stale.status, EvalRunStatus.Failed)
      assert.equal(stale.failureReason, EvalFailureReason.Interrupted)
      assert.equal(fresh.status, EvalRunStatus.Running)
      assert.equal(ended.status, EvalRunStatus.Done)
    } finally {
      sandboxes.restore()
    }
  })
})

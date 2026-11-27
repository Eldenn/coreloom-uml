/**
 * Written by QA for PR #150: the cases of issue #148 that `convention-evals.spec.ts` and
 * `convention-eval-sweep.spec.ts` do not prove. Two of them (the sweep's failed kill and its
 * queued-then-started run) failed on ed23be1 on purpose, each proving a finding of the review.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import AgentConfig from '#app/agent-configs/models/agent-config'
import {
  CONVENTION_EVAL_LIMITS,
  EvalFailureReason,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import { acquireEvalLock, evalLockKey, lockSeconds } from '#app/convention-evals/services/eval-lock'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'
import HarborRunner, { type HarborRunInput } from '#app/convention-evals/services/harbor-runner'
import PruneConventionEvalSandboxesJob from '#app/jobs/prune-convention-eval-sandboxes_job'
import type { RunConventionEvalJobData } from '#app/jobs/run-convention-eval_job'
import LanguageModels from '#app/llm/services/language-models'
import ClaudeCodeState from '#app/llm-connections/models/claude-code-state'
import { saveClaudeState } from '#app/llm-connections/services/claude-code-state'
import { saveApiKey } from '#app/llm-connections/services/llm-api-keys'
import User from '#app/users/models/user'
import llmConfig from '#config/llm'
import {
  ANTHROPIC_KEY,
  allowCliPath,
  anthropic,
  CANARY,
  claude,
  freeLock,
  json,
  lockIsFree,
  makeConfig,
  makeUser,
  mistral,
  quiet,
  runJob,
  start,
  turnOn,
  useHarbor,
  useModel,
  withDeadline,
} from '#tests/helpers/convention-evals'
import { FakeEvalSandboxes } from '#tests/helpers/fake-eval-sandbox'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { dumpDatabase } from '#tests/helpers/leaks'

/** The limits a test shortens for its length (`as const` is not frozen at runtime). */
const limits = CONVENTION_EVAL_LIMITS as unknown as {
  harborPollMs: number
}
const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-gaps-'))

const usage = (input: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
})

/** A model that answers at once, counting how many of its calls overlap. */
function overlapModel(delayMs = 30) {
  const seen = { inFlight: 0, max: 0, calls: 0 }
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      seen.calls++
      seen.inFlight++
      seen.max = Math.max(seen.max, seen.inFlight)
      await sleep(delayMs)
      seen.inFlight--
      return {
        content: [{ type: 'text', text: 'Done.' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: usage(10),
        warnings: [],
      }
    },
  })
  return { model, seen }
}

/** A model that never answers until its call is aborted. */
function hangingModel() {
  return new MockLanguageModelV4({
    doGenerate: (options) =>
      new Promise((_, reject) => {
        const signal = options.abortSignal
        if (signal?.aborted) reject(signal.reason)
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      }),
  })
}

/** A model whose every call spends `tokens` input tokens, then stops. */
function tokenModel(tokens: number) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'Done.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: usage(tokens),
      warnings: [],
    }),
  })
}

/** Harbor results with no state to grade (an agent error), each spending `input` tokens. */
const spending =
  (input: number, error: string | null = 'AgentTimeoutError', text = '') =>
  (run: HarborRunInput) =>
    run.trials.flatMap((trial) =>
      Array.from({ length: run.attempts }, (_, index) => ({
        taskId: trial.task.id,
        condition: trial.condition,
        attempt: index + 1,
        state: null,
        outputs: [{ path: 'agent/claude-code.txt', text }],
        usage: { input, cachedInput: 0, cacheWrite: 0, output: 0 },
        error,
        durationMs: 1000,
      })),
    )

/** Sets a limit for the length of `body`, then puts it back. */
async function withLimit(key: 'harborPollMs', value: number, body: () => Promise<void>) {
  const before = limits[key]
  limits[key] = value
  try {
    await body()
  } finally {
    limits[key] = before
  }
}

// ---- the routes --------------------------------------------------------------------------------

test.group('Convention tests (gaps) - routes', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => allowCliPath())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('the lock is the account’s: a second test of another configuration is refused 409', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const user = await makeUser()
    try {
      await turnOn(user)
      const first = await makeConfig(client, user, 'commits')
      const second = await makeConfig(client, user, 'commits')
      ;(await start(client, user, first)).response.assertStatus(202)
      const refused = await start(client, user, second)
      refused.response.assertStatus(409)
      assert.lengthOf(refused.sent, 0)
      assert.lengthOf(await ConventionEvalRun.query().where('agentConfigId', second), 0)
    } finally {
      await freeLock(user.id)
      sandboxes.restore()
    }
  })

  test('the lock lives the hard limit of its path plus five minutes', async ({ assert }) => {
    assert.equal(lockSeconds('cli'), 50 * 60)
    assert.equal(lockSeconds('harness'), 95 * 60)
    const user = await makeUser()
    try {
      assert.isTrue(await acquireEvalLock(user.id, 'cli', 'probe'))
      const ttl = await redis.ttl(evalLockKey(user.id))
      assert.isAbove(ttl, 50 * 60 - 5)
      assert.isAtMost(ttl, 50 * 60)
      assert.isFalse(await acquireEvalLock(user.id, 'harness', 'other'))
    } finally {
      await freeLock(user.id)
    }
  })

  test('a dispatch that fails ends the run runner_failed and gives the lock back', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      const { response } = await start(client, user, configId, mistral, { dispatchFails: true })
      response.assertStatus(500)
      const run = await ConventionEvalRun.query().where('agentConfigId', configId).firstOrFail()
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, EvalFailureReason.RunnerFailed)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('a credential in the body is never forwarded: the job gets the kind and the model', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const user = await makeUser()
    try {
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      const { response, sent } = await start(client, user, configId, {
        ...mistral,
        apiKey: CANARY,
        baseUrl: 'https://evil.example.com/v1',
      })
      response.assertStatus(202)
      assert.deepEqual(sent, [{ runId: response.body().runId, provider: mistral }])
      assert.notInclude(await dumpDatabase(), CANARY)
    } finally {
      await freeLock(user.id)
      sandboxes.restore()
    }
  })

  test('refuses with its reason, takes no lock and queues nothing: no_credential, over_cap, provider_settings', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await turnOn(user, FeatureFlagKey.LlmSubscriptionClaude)
      const configId = await makeConfig(client, user, 'both')

      // No OpenAI key saved.
      const noKey = await start(client, user, configId, { kind: 'openai', model: 'gpt-6.1-sol' })
      noKey.response.assertStatus(422)
      assert.equal(noKey.response.body().refusal, 'no_credential')

      // 18 Claude Code trials of the dearest model: even the lower estimate passes $5.
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const dear = await start(client, user, configId, {
        kind: 'anthropic',
        model: 'claude-fable-5-1',
      })
      dear.response.assertStatus(422)
      assert.equal(dear.response.body().refusal, 'over_cap')

      // A claude-code model name that reads as a flag of the binary.
      await saveClaudeState(user, { '.credentials.json': '{}' })
      const flag = await start(client, user, configId, { kind: 'claude-code', model: '--debug' })
      flag.response.assertStatus(422)
      assert.equal(flag.response.body().refusal, 'provider_settings')

      for (const refused of [noKey, dear, flag]) assert.lengthOf(refused.sent, 0)
      assert.lengthOf(await ConventionEvalRun.query().where('agentConfigId', configId), 0)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('answers 404 for a run of another configuration of the same owner, and without E2B', async ({
    client,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const user = await makeUser()
    try {
      await turnOn(user)
      const one = await makeConfig(client, user, 'commits')
      const other = await makeConfig(client, user, 'commits')
      const { response } = await start(client, user, one)
      const runId = response.body().runId as number
      ;(
        await client.get(`/agent-configs/${other}/evals/${runId}`).headers(json).loginAs(user)
      ).assertStatus(404)
      ;(
        await client.get(`/agent-configs/${one}/evals/999999`).headers(json).loginAs(user)
      ).assertStatus(404)

      // E2B not configured: the feature does not exist, flag on or not.
      app.container.swap(EvalSandboxes, () => {
        const fake = new EvalSandboxes()
        fake.configured = () => false
        return fake
      })
      ;(await client.get(`/agent-configs/${one}/evals`).headers(json).loginAs(user)).assertStatus(
        404,
      )
    } finally {
      await freeLock(user.id)
      sandboxes.restore()
    }
  })

  test('a subscription kind behind its off flag is refused 404 on start too, nothing queued', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      const { response, sent } = await start(client, user, configId, claude)
      response.assertStatus(404)
      assert.lengthOf(sent, 0)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })
})

// ---- the job -----------------------------------------------------------------------------------

test.group('Convention tests (gaps) - the job', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => allowCliPath())
  group.each.teardown(() => {
    app.container.restore(LanguageModels)
    app.container.restore(HarborRunner)
  })
  group.teardown(() => rmSync(tmp, { recursive: true, force: true }))

  test('path I: Harbor leaving no result fails the run runner_failed, kills the run’s sandboxes, frees the lock', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')
      useHarbor(() => [], { exit: 'now' })
      const { sent } = await start(client, user, configId, anthropic)
      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, EvalFailureReason.RunnerFailed)
      assert.isNotNull(run.endedAt)
      assert.lengthOf(trials, 0)
      assert.isTrue(sandboxes.listQueries.some((query) => query['coreloom.run'] === String(run.id)))
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('path II: no sandbox to be had stores every trial sandbox_unavailable and frees the lock', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes({ createFails: true }).install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(tokenModel(10))
      const { sent } = await start(client, user, configId)
      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.lengthOf(trials, 6)
      assert.isTrue(
        trials.every((trial) => trial.errorReason === EvalFailureReason.SandboxUnavailable),
      )
      // Decided: no trial graded is no result, `failed` for the reason the trials gave.
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, EvalFailureReason.SandboxUnavailable)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('path II: a subscription signed out between the request and the job fails with its reason', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await turnOn(user, FeatureFlagKey.LlmSubscriptionClaude)
      await saveClaudeState(user, { '.credentials.json': '{}' })
      const configId = await makeConfig(client, user, 'commits')
      useModel(tokenModel(10))
      const { response, sent } = await start(client, user, configId, claude)
      response.assertStatus(202)
      await ClaudeCodeState.query().where('userId', user.id).delete()
      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, 'subscription_expired')
      assert.lengthOf(trials, 0)
      assert.lengthOf(sandboxes.created, 0)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('path II: a saved key removed between the request and the job fails credential_unavailable', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(tokenModel(10))
      const { sent } = await start(client, user, configId)
      await saveApiKey(user, 'mistral', { apiKey: '', baseUrl: null })
      const { run } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, EvalFailureReason.CredentialUnavailable)
      assert.lengthOf(sandboxes.created, 0)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('path II with claude-code runs one trial at a time; mistral up to three', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await turnOn(user, FeatureFlagKey.LlmSubscriptionClaude)
      await saveClaudeState(user, { '.credentials.json': '{}' })
      const configId = await makeConfig(client, user, 'commits')

      const serial = overlapModel()
      useModel(serial.model)
      const first = await start(client, user, configId, claude)
      const done = await runJob(first.sent[0] as RunConventionEvalJobData)
      assert.equal(done.run.status, EvalRunStatus.Done)
      assert.equal(done.run.path, 'harness')
      assert.lengthOf(done.trials, 6)
      assert.equal(serial.seen.max, 1)
      // An equivalent cost, priced as the Anthropic key of the same model would be.
      assert.isAbove(done.run.costUsd ?? 0, 0)

      // The control: the same measurement sees overlap for a kind that is not serial.
      const parallel = overlapModel()
      useModel(parallel.model)
      const second = await start(client, user, configId, mistral)
      await runJob(second.sent[0] as RunConventionEvalJobData)
      assert.isAbove(parallel.seen.max, 1)
      assert.isAtMost(parallel.seen.max, CONVENTION_EVAL_LIMITS.concurrency)
    } finally {
      sandboxes.restore()
    }
  })

  test('path II: the hard limit cancels the run time_limit and aborts the trials under way', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'both')
      useModel(hangingModel())
      const { sent } = await start(client, user, configId)
      await withDeadline(300, async () => {
        const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)
        assert.equal(run.status, EvalRunStatus.Cancelled)
        assert.equal(run.failureReason, EvalFailureReason.TimeLimit)
        // The three under way were stopped and stored; the fifteen others never started.
        assert.isAtMost(trials.length, CONVENTION_EVAL_LIMITS.concurrency)
        assert.isTrue(trials.every((trial) => trial.errorReason === EvalFailureReason.TimeLimit))
        assert.isAtMost(sandboxes.created.length, CONVENTION_EVAL_LIMITS.concurrency)
        assert.equal(sandboxes.killed.length, sandboxes.created.length)
      })
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('path I: the hard limit kills Harbor’s process group and cancels the run time_limit', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')
      const harbor = useHarbor(() => [], { exit: 'onKill' })
      const { sent } = await start(client, user, configId, anthropic)
      await withDeadline(300, async () => {
        const { run } = await runJob(sent[0] as RunConventionEvalJobData)
        assert.equal(run.status, EvalRunStatus.Cancelled)
        assert.equal(run.failureReason, EvalFailureReason.TimeLimit)
      })
      assert.include(harbor.signals, 'SIGTERM')
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      sandboxes.restore()
    }
  })

  test('path I: past the cap while Harbor runs, its process is killed and the run cancelled cap_reached', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')
      // Each trial Harbor reports spent 1M uncached input tokens: $2 at Sonnet's price.
      const harbor = useHarbor(spending(1_000_000), { exit: 'onKill' })
      const { sent } = await start(client, user, configId, anthropic)
      await withLimit('harborPollMs', 20, async () => {
        const { run } = await runJob(sent[0] as RunConventionEvalJobData)
        assert.equal(run.status, EvalRunStatus.Cancelled)
        assert.equal(run.failureReason, EvalFailureReason.CapReached)
        assert.isAbove(run.costUsd ?? 0, 5)
      })
      assert.include(harbor.signals, 'SIGTERM')
    } finally {
      sandboxes.restore()
    }
  })

  test('a kind with no price is capped in tokens: cancelled cap_reached past maxTokens', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    // Ollama takes no key but an allowlisted base URL, read from the saved row.
    const OLLAMA = 'http://localhost:11434'
    const allowed = llmConfig.allowedOrigins.splice(0, Infinity, OLLAMA)
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'both')
      useModel(tokenModel(1_000_000))
      await saveApiKey(user, 'ollama', { apiKey: '', baseUrl: OLLAMA })
      const { response, sent } = await start(client, user, configId, {
        kind: 'ollama',
        model: 'qwen3',
      })
      assert.equal(response.status(), 202, JSON.stringify(response.body()))
      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Cancelled)
      assert.equal(run.failureReason, EvalFailureReason.CapReached)
      assert.isNull(run.costUsd)
      assert.isBelow(trials.length, 18)
      assert.isAtMost(run.inputTokens, CONVENTION_EVAL_LIMITS.maxTokens + 3 * 1_000_010)
    } finally {
      llmConfig.allowedOrigins.splice(0, Infinity, ...allowed)
      sandboxes.restore()
    }
  })

  test('a canary in a grader’s reason makes the run leaked, with nothing of it stored', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes({
      grades: {
        success: { verdict: 'pass', reason: `read ${CANARY} from .env` },
        compliance: { verdict: 'pass', reason: 'ok' },
      },
    }).install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(tokenModel(10))
      const { sent } = await start(client, user, configId)
      const { run } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Leaked)
      assert.notInclude(await dumpDatabase(), CANARY)
    } finally {
      sandboxes.restore()
    }
  })

  test('path I: the key in Harbor’s error text makes the run leaked', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')
      useHarbor(spending(10, `AuthError ${ANTHROPIC_KEY}`), { exit: 'now' })
      const { sent } = await start(client, user, configId, anthropic)
      const { run } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Leaked)
      assert.notInclude(await dumpDatabase(), ANTHROPIC_KEY.slice(20))
    } finally {
      sandboxes.restore()
    }
  })

  test('the stored result says which path ran, through the show route', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(tokenModel(10))
      const { sent } = await start(client, user, configId)
      const { run } = await runJob(sent[0] as RunConventionEvalJobData)
      const shown = await client
        .get(`/agent-configs/${configId}/evals/${run.id}`)
        .headers(json)
        .loginAs(user)
      shown.assertStatus(200)
      assert.equal(shown.body().run.path, 'harness')
      assert.equal(shown.body().run.label, 'your model + your conventions')
      assert.lengthOf(shown.body().trials, 6)
    } finally {
      sandboxes.restore()
    }
  })

  test('a job whose run already ended does nothing: no sandbox, no trial, its status kept', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const user = await makeUser()
    try {
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(tokenModel(10))
      const { sent } = await start(client, user, configId)
      const data = sent[0] as RunConventionEvalJobData
      await ConventionEvalRun.query()
        .where('id', data.runId)
        .update({ status: EvalRunStatus.Failed, failureReason: EvalFailureReason.Interrupted })
      const { run, trials } = await runJob(data)
      assert.equal(run.failureReason, EvalFailureReason.Interrupted)
      assert.lengthOf(trials, 0)
      assert.lengthOf(sandboxes.created, 0)
    } finally {
      await freeLock(user.id)
      sandboxes.restore()
    }
  })
})

// ---- the sweep ---------------------------------------------------------------------------------

async function sweep() {
  const job = new PruneConventionEvalSandboxesJob()
  job.data = {}
  job.logger = quiet
  await job.process()
}

async function makeRun(
  status: EvalRunStatus,
  createdAt: DateTime,
  startedAt: DateTime | null = null,
) {
  const user = await User.create({
    email: `sweep-gaps-${Math.random().toString(36).slice(2)}@example.com`,
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
  return ConventionEvalRun.create({
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
    startedAt,
    endedAt: null,
    createdAt,
  })
}

test.group('Convention tests (gaps) - the sweep', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('ends a queued run left past the limit as interrupted, and keeps one at 94 minutes', async ({
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const stale = await makeRun(EvalRunStatus.Queued, DateTime.now().minus({ minutes: 96 }))
      const young = await makeRun(EvalRunStatus.Running, DateTime.now().minus({ minutes: 94 }))
      await sweep()
      await stale.refresh()
      await young.refresh()
      assert.equal(stale.status, EvalRunStatus.Failed)
      assert.equal(stale.failureReason, EvalFailureReason.Interrupted)
      assert.isNotNull(stale.endedAt)
      assert.equal(young.status, EvalRunStatus.Running)
    } finally {
      sandboxes.restore()
    }
  })

  test('kills an old sandbox Harbor labelled with harbor.job_id alone', async ({ assert }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      sandboxes.listed = [
        {
          sandboxId: 'job',
          metadata: { 'harbor.job_id': 'j' },
          startedAt: new Date(Date.now() - 51 * 60_000),
        },
        {
          sandboxId: 'fresh',
          metadata: { 'harbor.job_id': 'k' },
          startedAt: new Date(Date.now() - 49 * 60_000),
        },
      ]
      await sweep()
      assert.deepEqual(sandboxes.killed, ['job'])
    } finally {
      sandboxes.restore()
    }
  })

  test('one kill that fails still kills the others and ends the abandoned runs', async ({
    assert,
  }) => {
    const killed: string[] = []
    app.container.swap(EvalSandboxes, () => {
      const fake = new EvalSandboxes()
      fake.configured = () => true
      fake.list = async () => [
        {
          sandboxId: 'boom',
          metadata: { 'coreloom.purpose': 'convention-evals' },
          startedAt: new Date(0),
        },
        {
          sandboxId: 'ok',
          metadata: { 'coreloom.purpose': 'convention-evals' },
          startedAt: new Date(0),
        },
      ]
      fake.kill = async (id) => {
        if (id === 'boom') throw new Error('E2B 500')
        killed.push(id)
      }
      return fake
    })
    try {
      const stale = await makeRun(EvalRunStatus.Running, DateTime.now().minus({ hours: 3 }))
      await sweep().catch(() => undefined)
      await stale.refresh()
      assert.include(killed, 'ok')
      assert.equal(stale.failureReason, EvalFailureReason.Interrupted)
    } finally {
      app.container.restore(EvalSandboxes)
    }
  })

  test('a run queued long and started 20 minutes ago is not interrupted', async ({ assert }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const run = await makeRun(
        EvalRunStatus.Running,
        DateTime.now().minus({ minutes: 100 }),
        DateTime.now().minus({ minutes: 20 }),
      )
      await sweep()
      await run.refresh()
      assert.equal(run.status, EvalRunStatus.Running)
    } finally {
      sandboxes.restore()
    }
  })
})

import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { Condition, createWorkspace } from '@coreloom-uml/catalog/evals'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import {
  CONVENTION_EVAL_LIMITS,
  EvalFailureReason,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import ConventionEvalTrial from '#app/convention-evals/models/convention-eval-trial'
import { DENY_SUDO } from '#app/convention-evals/services/eval-commands'
import { evalsHome } from '#app/convention-evals/services/eval-folders'
import HarborRunner, {
  type HarborRunInput,
  type HarborTrialResult,
} from '#app/convention-evals/services/harbor-runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import type { RunConventionEvalJobData } from '#app/jobs/run-convention-eval_job'
import LanguageModels from '#app/llm/services/language-models'
import { saveApiKey } from '#app/llm-connections/services/llm-api-keys'
import {
  ANTHROPIC_KEY,
  anthropic,
  CANARY,
  freeLock,
  json,
  lockIsFree,
  makeConfig,
  makeUser,
  runJob,
  start,
  turnOn,
  useHarbor,
  useModel,
} from '#tests/helpers/convention-evals'
import { FakeEvalSandboxes } from '#tests/helpers/fake-eval-sandbox'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-spec-'))

/** A model that fixes and commits, then says so, in every trial; its usage is tiny. */
const COMMITS = () =>
  new MockLanguageModelV4({
    doGenerate: async (options) => {
      const usage = {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      }
      if (options.prompt.at(-1)?.role === 'tool') {
        return {
          content: [{ type: 'text', text: 'Fixed and committed.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        }
      }
      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: `call-${String(options.prompt.length)}`,
            toolName: 'run',
            input: JSON.stringify({ command: 'git commit -am "fix: sum"' }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      }
    },
  })

/** A model whose every call costs about $1.40 at the most expensive Mistral price. */
function costlyModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'Done.' }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 1_000_000, noCache: 1_000_000, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

/** One Harbor result per trial asked, each with a real final state to grade. */
function harborResults(output: string) {
  return (input: HarborRunInput): HarborTrialResult[] =>
    input.trials.flatMap((trial) =>
      Array.from({ length: input.attempts }, (_, index) => {
        const parent = mkdtempSync(join(tmp, 'harbor-'))
        const state = createWorkspace(trial.task, trial.condition, parent, trial.files)
        return {
          taskId: trial.task.id,
          condition: trial.condition,
          attempt: index + 1,
          state,
          outputs: [{ path: 'agent/claude-code.txt', text: output }],
          usage: { input: 100, cachedInput: 1000, cacheWrite: 100, output: 50 },
          error: null,
          durationMs: 1000,
        }
      }),
    )
}

test.group('Convention tests - routes', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(async () => {
    app.container.restore(LanguageModels)
  })

  test('answer 404 while the flag is off, and on another account configuration', async ({
    client,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const owner = await makeUser()
      const configId = await makeConfig(client, owner, 'commits')
      const off = await client.get(`/agent-configs/${configId}/evals`).headers(json).loginAs(owner)
      off.assertStatus(404)
      ;(await start(client, owner, configId)).response.assertStatus(404)

      await turnOn(owner)
      const intruder = await makeUser()
      await turnOn(intruder)
      for (const request of [
        client.get(`/agent-configs/${configId}/evals`),
        client.get(`/agent-configs/${configId}/evals/plan?kind=mistral&model=x`),
        client.get(`/agent-configs/${configId}/evals/1`),
      ]) {
        ;(await request.headers(json).loginAs(intruder)).assertStatus(404)
      }
      ;(await start(client, intruder, configId)).response.assertStatus(404)
    } finally {
      sandboxes.restore()
    }
  })

  test('plan the path, the agent and the estimate per kind', async ({ client, assert }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'both')
      const plan = async (kind: string, model: string) => {
        const response = await client
          .get(`/agent-configs/${configId}/evals/plan?kind=${kind}&model=${model}`)
          .headers(json)
          .loginAs(user)
        response.assertStatus(200)
        return response.body()
      }

      const cli = await plan('anthropic', 'claude-sonnet-5-5')
      assert.equal(cli.path, 'cli')
      assert.equal(cli.agent, 'claude-code')
      assert.equal(cli.label, 'Claude Code + your conventions')
      assert.equal(cli.trials, 18)
      assert.lengthOf(cli.tasks, 3)
      assert.isNull(cli.refusal)
      assert.equal(cli.pricesCheckedOn, '2026-11-27')
      assert.equal(cli.capUsd, 5)
      assert.isBelow(cli.estimate.lowUsd, cli.estimate.highUsd)

      const codex = await plan('openai', 'gpt-6.1-sol')
      assert.equal(codex.path, 'cli')
      assert.equal(codex.agent, 'codex')
      // No OpenAI key saved.
      assert.equal(codex.refusal, 'no_credential')

      const harness = await plan('mistral', 'mistral-small-2603')
      assert.equal(harness.path, 'harness')
      assert.equal(harness.label, 'your model + your conventions')
      assert.isNull(harness.refusal)

      const local = await plan('ollama', 'qwen3')
      assert.equal(local.path, 'harness')
      assert.isNull(local.estimate)

      // A subscription kind behind its off flag does not exist.
      const claude = await client
        .get(`/agent-configs/${configId}/evals/plan?kind=claude-code&model=sonnet`)
        .headers(json)
        .loginAs(user)
      claude.assertStatus(404)
      await updateFlag(
        FeatureFlagKey.LlmSubscriptionClaude,
        { enabled: true, rollout: 100, rules: [] },
        user,
      )
      const unconnected = await plan('claude-code', 'sonnet')
      assert.equal(unconnected.path, 'harness')
      assert.equal(unconnected.refusal, 'no_credential')
    } finally {
      sandboxes.restore()
    }
  })

  test('refuse a configuration with no testable rule, with its reason', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'none')
      const { response, sent } = await start(client, user, configId)
      response.assertStatus(422)
      assert.equal(response.body().refusal, 'no_testable_rule')
      assert.lengthOf(sent, 0)
      assert.lengthOf(await ConventionEvalRun.query().where('agentConfigId', configId), 0)
    } finally {
      sandboxes.restore()
    }
  })

  test('start a run with 202, its job holding ids and kinds only, and refuse a second', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const user = await makeUser()
    try {
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')

      const first = await start(client, user, configId, anthropic)
      first.response.assertStatus(202)
      const { runId } = first.response.body()
      assert.deepEqual(first.sent, [{ runId, provider: anthropic }])
      assert.notInclude(JSON.stringify(first.sent), ANTHROPIC_KEY)
      const run = await ConventionEvalRun.findOrFail(runId)
      assert.equal(run.status, EvalRunStatus.Queued)
      assert.equal(run.path, 'cli')
      assert.equal(run.trialCount, 6)

      const second = await start(client, user, configId, anthropic)
      second.response.assertStatus(409)
      assert.lengthOf(second.sent, 0)

      const shown = await client
        .get(`/agent-configs/${configId}/evals/${runId}`)
        .headers(json)
        .loginAs(user)
      shown.assertStatus(200)
      assert.equal(shown.body().run.status, 'queued')
      assert.deepEqual(shown.body().trials, [])
      const list = await client.get(`/agent-configs/${configId}/evals`).headers(json).loginAs(user)
      list.assertStatus(200)
      assert.equal(list.body().meta.total, 1)
      assert.notInclude(await dumpDatabase(), ANTHROPIC_KEY.slice(20))
    } finally {
      await freeLock(user.id)
      sandboxes.restore()
    }
  })
})

test.group('Convention tests - the job', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(async () => {
    app.container.restore(LanguageModels)
    app.container.restore(HarborRunner)
  })
  group.teardown(() => rmSync(tmp, { recursive: true, force: true }))

  test('path II: runs every trial in a sandbox cut off the network, graded there', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(COMMITS())
      const { response, sent } = await start(client, user, configId)
      response.assertStatus(202)

      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)

      assert.equal(run.status, EvalRunStatus.Done)
      assert.equal(run.agent, 'harness')
      assert.lengthOf(trials, 6)
      assert.deepEqual(trials.map((trial) => trial.condition).sort(), [
        'full',
        'full',
        'full',
        'none',
        'none',
        'none',
      ])
      assert.isTrue(trials.every((trial) => trial.successVerdict === 'pass'))
      assert.include(trials[0]?.output ?? '', 'git commit -am')
      // One sandbox per trial, each isolated and killed, every one of the model's commands run
      // through the fixed line, and the graders run as root in the sandbox.
      assert.lengthOf(sandboxes.created, 6)
      assert.equal(sandboxes.isolated, 6)
      assert.lengthOf(sandboxes.killed, 6)
      assert.lengthOf(sandboxes.modelCommands, 6)
      assert.isTrue(
        sandboxes.runs.filter((item) => item.envs.TASK_ID).every((item) => item.user === 'root'),
      )
      // Sudo is taken from the model's user, as root, before the workspace is set up.
      const first = sandboxes.runs[0]
      assert.equal(first?.command, DENY_SUDO)
      assert.equal(first?.user, 'root')
      assert.deepEqual(first?.envs, {})
      // The lock is free and the run's folder gone.
      assert.isTrue(await lockIsFree(user.id))
      assert.deepEqual(readdirSync(evalsHome()), [])
    } finally {
      sandboxes.restore()
    }
  })

  test('a trial that throws stops its siblings: no trial starts after it, the run fails', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const own = Object.getOwnPropertyDescriptor(ConventionEvalTrial, 'create')
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'both')
      useModel(COMMITS())
      const { sent } = await start(client, user, configId)
      // The database refuses the first trial stored: the others under way end, none starts.
      Object.defineProperty(ConventionEvalTrial, 'create', {
        configurable: true,
        writable: true,
        value: async () => {
          throw new Error('the database is gone')
        },
      })
      const { run } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, EvalFailureReason.RunnerFailed)
      assert.isAtMost(sandboxes.created.length, CONVENTION_EVAL_LIMITS.concurrency)
      assert.equal(sandboxes.killed.length, sandboxes.created.length)
      assert.isTrue(await lockIsFree(user.id))
    } finally {
      if (own) Object.defineProperty(ConventionEvalTrial, 'create', own)
      else delete (ConventionEvalTrial as unknown as Record<string, unknown>).create
      sandboxes.restore()
    }
  })

  test('a canary in an output makes the run leaked, with nothing of it stored', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes({
      shell: () => ({ exitCode: 0, output: `ANTHROPIC_API_KEY=${CANARY}` }),
    }).install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'commits')
      useModel(COMMITS())
      const { sent } = await start(client, user, configId)
      const logs = captureLogs()
      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)
      logs.restore()

      assert.equal(run.status, EvalRunStatus.Leaked)
      assert.equal(run.failureReason, EvalFailureReason.Leaked)
      assert.isAtLeast(trials.length, 1)
      assert.isBelow(trials.length, 6)
      const leaked = trials.filter((trial) => trial.errorReason === 'leaked')
      assert.lengthOf(leaked, 1)
      assert.isNull(leaked[0]?.output ?? null)
      assert.notInclude(await dumpDatabase(), CANARY)
      assert.notInclude(logs.lines.join('\n'), CANARY)
    } finally {
      sandboxes.restore()
    }
  })

  test('stops at the cap: cancelled, the remaining trials never started', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      const configId = await makeConfig(client, user, 'both')
      useModel(costlyModel())
      // A model the table does not list: priced as Mistral's most expensive, $1.40 a call here.
      const { sent } = await start(client, user, configId, { kind: 'mistral', model: 'unlisted' })
      const { run, trials } = await runJob(sent[0] as RunConventionEvalJobData)

      assert.equal(run.status, EvalRunStatus.Cancelled)
      assert.equal(run.failureReason, EvalFailureReason.CapReached)
      assert.isBelow(trials.length, 18)
      assert.isBelow(sandboxes.created.length, 18)
      // What was spent is what was measured, past the cap by less than one wave.
      assert.isAbove(run.costUsd ?? 0, 5)
      assert.isBelow(run.costUsd ?? 0, 5 + 3 * 1.5)
    } finally {
      sandboxes.restore()
    }
  })

  test("path I: the key only in Harbor's environment, graded in sandboxes, leaked on its base64", async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')

      const clean = useHarbor(harborResults('Fixed the sum and committed it.'))
      const first = await start(client, user, configId, anthropic)
      const done = await runJob(first.sent[0] as RunConventionEvalJobData)
      assert.equal(done.run.status, EvalRunStatus.Done)
      assert.equal(done.run.agent, 'claude-code')
      assert.lengthOf(done.trials, 6)
      assert.equal(done.run.inputTokens, 600)
      assert.isAbove(done.run.costUsd ?? 0, 0)
      // The key went to the child's environment under its name, nowhere in what Harbor was given.
      assert.equal(clean.started[0]?.env.ANTHROPIC_API_KEY, ANTHROPIC_KEY)
      assert.notInclude(JSON.stringify(clean.prepared), ANTHROPIC_KEY)
      const full = clean.prepared[0]?.trials.find((trial) => trial.condition === Condition.Full)
      const files = Object.keys(full?.files ?? {})
      assert.include(files, 'AGENTS.md')
      assert.include(files, 'CLAUDE.md')
      assert.lengthOf(sandboxes.created, 6)

      // The key's base64, anywhere in an output, ends the run as leaked.
      const encoded = Buffer.from(`token=${ANTHROPIC_KEY};`).toString('base64')
      useHarbor(harborResults(`env dump: ${encoded}`))
      const second = await start(client, user, configId, anthropic)
      const leaked = await runJob(second.sent[0] as RunConventionEvalJobData)
      assert.equal(leaked.run.status, EvalRunStatus.Leaked)
      assert.lengthOf(leaked.trials, 1)
      assert.isNull(leaked.trials[0]?.output ?? null)
      assert.notInclude(await dumpDatabase(), encoded)
      // Whatever E2B still listed for the run was asked for.
      assert.isTrue(
        sandboxes.listQueries.some((query) => query['coreloom.run'] === String(leaked.run.id)),
      )
    } finally {
      sandboxes.restore()
    }
  })

  test('fails without a credential to resolve, and gives the lock back', async ({
    client,
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    try {
      const user = await makeUser()
      await turnOn(user)
      await saveApiKey(user, 'anthropic', { apiKey: ANTHROPIC_KEY, baseUrl: null })
      const configId = await makeConfig(client, user, 'commits')
      useHarbor(harborResults(''))
      const { sent } = await start(client, user, configId, anthropic)
      // The key is removed between the request and the job.
      await saveApiKey(user, 'anthropic', { apiKey: '', baseUrl: null })
      const { run } = await runJob(sent[0] as RunConventionEvalJobData)
      assert.equal(run.status, EvalRunStatus.Failed)
      assert.equal(run.failureReason, EvalFailureReason.CredentialUnavailable)
      assert.isTrue(await lockIsFree(user.id, 'cli'))
    } finally {
      sandboxes.restore()
    }
  })
})

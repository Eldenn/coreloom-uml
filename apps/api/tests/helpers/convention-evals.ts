/**
 * What the convention tests' specs share: an account with the flag on, a configuration holding
 * testable rules, the route started with the job's `dispatch` stubbed, the job run as the worker
 * runs it, Harbor swapped for path I, and the account lock read back. Nothing here reaches E2B,
 * Harbor or a provider.
 */
import type { Logger } from '@adonisjs/core/logger'
import app from '@adonisjs/core/services/app'
import redis from '@adonisjs/redis/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { LanguageModel } from '@coreloom-uml/llm'
import type { TestContext } from '@japa/runner/core'
import type { EvalPath } from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import ConventionEvalTrial from '#app/convention-evals/models/convention-eval-trial'
import {
  acquireEvalLock,
  evalLockKey,
  releaseEvalLock,
} from '#app/convention-evals/services/eval-lock'
import HarborRunner, {
  type HarborModule,
  type HarborRunInput,
  type HarborTrialResult,
} from '#app/convention-evals/services/harbor-runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import RunConventionEvalJob, {
  type RunConventionEvalJobData,
} from '#app/jobs/run-convention-eval_job'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

type Client = TestContext['client']
type FlagKey = (typeof FeatureFlagKey)[keyof typeof FeatureFlagKey]

export const json = { accept: 'application/json' }
/** A saved Anthropic key of the fixture: built so no file holds it whole. */
export const ANTHROPIC_KEY = ['sk-ant-api03', 'fixture', 'Q'.repeat(32)].join('-')
/** What a model must never get to print: the shape of a key, nowhere in the account. */
export const CANARY = ['sk-ant-api03', 'canary', 'Z'.repeat(32)].join('-')
export const mistral = { kind: 'mistral', model: 'mistral-small-2603' }
export const anthropic = { kind: 'anthropic', model: 'claude-sonnet-5-5' }
export const claude = { kind: 'claude-code', model: 'sonnet' }
export const quiet = { info: () => {}, warn: () => {}, error: () => {} } as unknown as Logger

export async function makeUser() {
  const user = await User.create({
    email: `evals-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  await saveTestLlmKey(user)
  return user
}

export async function turnOn(user: User, key: FlagKey = FeatureFlagKey.ConventionEvals) {
  await updateFlag(key, { enabled: true, rollout: 100, rules: [] }, user)
}

/** A configuration holding Conventional Commits (one task) and, when asked, pnpm (two more). */
export async function makeConfig(client: Client, user: User, rules: 'commits' | 'both' | 'none') {
  const created = await client
    .post('/agent-configs')
    .headers(json)
    .loginAs(user)
    .json({ name: 'Storefront', targets: ['generic'] })
  created.assertStatus(201)
  const id = created.body().config.id as number
  const put = (slot: string, rule: string) =>
    client
      .put(`/agent-configs/${id}/ready-rules/${slot}`)
      .headers(json)
      .loginAs(user)
      .json({ rules: [{ rule }] })
  if (rules !== 'none') (await put('git.commit-messages', 'conventional')).assertStatus(200)
  if (rules === 'both') (await put('tooling.package-manager', 'pnpm')).assertStatus(200)
  return id
}

export function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** Replaces the job's `dispatch` until restored; `sent` holds the data it got. */
function stubDispatch(fails: boolean) {
  const sent: RunConventionEvalJobData[] = []
  const own = Object.getOwnPropertyDescriptor(RunConventionEvalJob, 'dispatch')
  Object.defineProperty(RunConventionEvalJob, 'dispatch', {
    configurable: true,
    writable: true,
    value: async (data: RunConventionEvalJobData) => {
      if (fails) throw new Error('redis is down')
      sent.push(data)
    },
  })
  return {
    sent,
    restore: () => {
      if (own) Object.defineProperty(RunConventionEvalJob, 'dispatch', own)
      else delete (RunConventionEvalJob as unknown as Record<string, unknown>).dispatch
    },
  }
}

/** Starts a test through the route, the job stubbed: answers the response and the job's data. */
export async function start(
  client: Client,
  user: User,
  configId: number,
  provider: Record<string, unknown> = mistral,
  options: { dispatchFails?: boolean } = {},
) {
  const stub = stubDispatch(options.dispatchFails ?? false)
  try {
    const response = await client
      .post(`/agent-configs/${configId}/evals`)
      .headers(json)
      .loginAs(user)
      .json({ provider })
    return { response, sent: stub.sent }
  } finally {
    stub.restore()
  }
}

/** Runs the job as the worker does. */
export async function runJob(data: RunConventionEvalJobData) {
  const job = new RunConventionEvalJob()
  job.data = data
  job.logger = quiet
  await job.process()
  const run = await ConventionEvalRun.findOrFail(data.runId)
  const trials = await ConventionEvalTrial.query().where('runId', run.id).orderBy('id')
  return { run, trials }
}

/** Runs `body` with the job's hard limit cut to `ms` on every path (`deadlineOf`). */
export async function withDeadline(ms: number, body: () => Promise<void>) {
  const own = RunConventionEvalJob.deadlineOf
  RunConventionEvalJob.deadlineOf = () => AbortSignal.timeout(ms)
  try {
    await body()
  } finally {
    RunConventionEvalJob.deadlineOf = own
  }
}

/** Whether the account's slot is free: taken and given back at once when it is. */
export async function lockIsFree(userId: number, path: EvalPath = 'harness') {
  const free = await acquireEvalLock(userId, path, 'probe')
  if (free) await releaseEvalLock(userId, 'probe')
  return free
}

/** Frees the account's slot whoever holds it, for a spec's clean-up. */
export async function freeLock(userId: number) {
  await redis.del(evalLockKey(userId))
}

/**
 * Harbor as the runner of path I exports it, recording what it was given. `exit` decides when
 * its process ends: `now`, or `onKill` (only once the job kills it, as a hung Harbor would).
 * `results` is what its job folder holds, read at each poll.
 */
export function useHarbor(
  results: (input: HarborRunInput) => HarborTrialResult[],
  options: { exit?: 'now' | 'onKill' } = {},
) {
  const seen = {
    prepared: [] as HarborRunInput[],
    started: [] as { file: string; args: readonly string[]; env: Record<string, string> }[],
    signals: [] as string[],
  }
  let last: HarborRunInput | null = null
  const module: HarborModule = {
    async prepareHarborRun(input) {
      seen.prepared.push(input)
      last = input
      return {
        file: '/usr/bin/harbor',
        args: ['run', '-e', 'e2b'],
        env: { PATH: '/usr/bin' },
        jobDir: `${input.dir}/job`,
      }
    },
    credentialEnvName: (agent) => (agent === 'codex' ? 'CODEX_API_KEY' : 'ANTHROPIC_API_KEY'),
    async readHarborJob() {
      return last ? results(last) : []
    },
  }
  app.container.swap(HarborRunner, () => {
    const fake = new HarborRunner()
    fake.load = async () => module
    fake.start = (command) => {
      seen.started.push(command)
      let exit: (code: number) => void = () => {}
      const exited = new Promise<number>((resolve) => {
        exit = resolve
        if ((options.exit ?? 'now') === 'now') resolve(0)
      })
      return {
        exited,
        kill: (signal: NodeJS.Signals) => {
          seen.signals.push(signal)
          exit(143)
        },
      }
    }
    return fake
  })
  return seen
}

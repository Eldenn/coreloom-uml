import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { MODEL_SUGGESTIONS, type ProviderKind } from '@coreloom-uml/catalog'
import { FeatureFlagKey, type FeatureFlagState } from '@coreloom-uml/feature-flags'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { createAgentConfig } from '#app/agent-configs/services/agent-config-writes'
import { replaceReadyRules } from '#app/agent-configs/services/agent-rules'
import { findOwnedAgentConfig } from '#app/agent-configs/services/owned-agent-config'
import { defaultAccountConfig } from '#app/auth/services/default-account'
import { EVAL_SANDBOX_METADATA, EvalPath } from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import ConventionEvalTrial from '#app/convention-evals/models/convention-eval-trial'
import { planEval } from '#app/convention-evals/services/eval-plan'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'
import { startConventionEval } from '#app/convention-evals/services/eval-start'
import { isFeatureEnabled, updateFlag } from '#app/feature-flags/services/feature-flags'
import RunConventionEvalJob, {
  type RunConventionEvalJobData,
} from '#app/jobs/run-convention-eval_job'
import User from '#app/users/models/user'

/*
 * The admin's pilot of the convention tests (`node ace evals:pilot`, dev only): the flag for the
 * admin alone, a configuration to test, and one run through the route's own start
 * (`startConventionEval`) and the job's own `process()`, in this process. Prints ids, counts,
 * verdicts and tokens only: never a credential, an output or a reason.
 */

export const PILOT_CONFIG_NAME = 'Convention tests pilot'
export const PILOT_RULES = [
  { slot: 'git.commit-messages', rule: 'conventional' },
  { slot: 'tooling.package-manager', rule: 'pnpm' },
] as const

type Print = (line: string) => void

/** A refusal the command prints and exits 1 with. */
export class PilotRefusal extends Error {}

/** The admin: the default account (`DEFAULT_ACCOUNT_EMAIL`), which must exist. */
export async function pilotAdmin(): Promise<User> {
  const email = defaultAccountConfig()?.email
  if (!email) throw new PilotRefusal('DEFAULT_ACCOUNT_EMAIL is not set')
  const admin = await User.findBy('email', email)
  if (!admin) throw new PilotRefusal(`no account for ${email}: start the API once to create it`)
  return admin
}

/** The flag's state for the pilot: on for the admin's email only. */
export function pilotFlagState(email: string): FeatureFlagState {
  return {
    enabled: true,
    rollout: 0,
    rules: [
      { id: 'pilot-admin', attribute: 'email', operator: 'in', values: [email], serve: true },
    ],
  }
}

/** Sets the flag for the admin alone, then checks it reads on for the admin and off for another. */
export async function enablePilotFlag(print: Print): Promise<void> {
  const admin = await pilotAdmin()
  await updateFlag(FeatureFlagKey.ConventionEvals, pilotFlagState(admin.email), admin)
  const forAdmin = await isFeatureEnabled(FeatureFlagKey.ConventionEvals, admin)
  print(`isFeatureEnabled(convention-evals, admin #${String(admin.id)}) = ${String(forAdmin)}`)
  const other = await User.query().whereNot('id', admin.id).orderBy('id').first()
  const forOther = other ? await isFeatureEnabled(FeatureFlagKey.ConventionEvals, other) : false
  print(
    other
      ? `isFeatureEnabled(convention-evals, account #${String(other.id)}) = ${String(forOther)}`
      : 'no other account to check',
  )
  if (!forAdmin || forOther) throw new PilotRefusal('the flag does not read as the pilot needs')
}

/**
 * The admin's configuration "Convention tests pilot", outside any project, created through the
 * routes' services when missing, holding `PILOT_RULES`. Answers its id.
 */
export async function preparePilotConfig(print: Print): Promise<number> {
  const admin = await pilotAdmin()
  let config = await AgentConfig.query()
    .where('userId', admin.id)
    .where('name', PILOT_CONFIG_NAME)
    .whereNull('projectId')
    .first()
  if (config) print(`reusing configuration #${String(config.id)}`)
  else {
    const created = await createAgentConfig(admin, {
      name: PILOT_CONFIG_NAME,
      projectId: null,
      targets: ['generic'],
    })
    if (!('config' in created)) throw new PilotRefusal('the configuration could not be created')
    config = created.config
    print(`created configuration #${String(config.id)}`)
  }
  for (const { slot, rule } of PILOT_RULES) {
    const held = await replaceReadyRules(config.id, admin, slot, () => [{ rule, value: null }])
    if (!(held instanceof AgentConfig)) throw new PilotRefusal(`${slot} = ${rule} was refused`)
    print(`holds ${slot} = ${rule}`)
  }
  return config.id
}

/** The model the admin's browser would send for this kind: the catalog's first suggestion. */
export function defaultModelOf(kind: ProviderKind): string | null {
  return MODEL_SUGGESTIONS[kind]?.[0] ?? null
}

export type PilotRunOptions = { configId: number; kind: ProviderKind; model: string; dry: boolean }

/**
 * Plans the test as `GET …/evals/plan` does and refuses anything but path II (path I waits for
 * #153); without `dry`, starts it as `POST …/evals` does and runs the job here, printing each
 * trial as it is stored, then the summary.
 */
export async function runPilot(options: PilotRunOptions, print: Print): Promise<void> {
  const admin = await pilotAdmin()
  if (!(await isFeatureEnabled(FeatureFlagKey.ConventionEvals, admin))) {
    throw new PilotRefusal('the flag is off for the admin: run --enable-flag first')
  }
  const config = await findOwnedAgentConfig(options.configId, admin)
  if (!config)
    throw new PilotRefusal(`configuration #${String(options.configId)} is not the admin's`)
  if (!(await app.container.make(EvalSandboxes)).configured()) {
    throw new PilotRefusal('E2B is not configured (E2B_API_KEY)')
  }
  const provider = { kind: options.kind, model: options.model }
  const plan = await planEval(config, provider, admin)
  if ('notFound' in plan) throw new PilotRefusal(`${options.kind} is behind its own flag`)
  print(
    `plan: path=${plan.path} agent=${plan.agent} rules=${plan.rules.map((rule) => `${rule.slot}=${rule.rule}`).join(',')} tasks=${String(plan.tasks.length)} trials=${String(plan.trials)} estimate=${plan.estimate ? `$${String(plan.estimate.lowUsd)}-$${String(plan.estimate.highUsd)}` : 'none'} prices=${plan.pricesCheckedOn} cap=$${String(plan.capUsd)} refusal=${plan.refusal ?? 'none'}`,
  )
  if (plan.path !== EvalPath.Harness) {
    throw new PilotRefusal('path I (a saved key) is blocked until #153: use a path II kind')
  }
  if (plan.refusal) throw new PilotRefusal(`the plan refuses: ${plan.refusal}`)
  if (options.dry) return

  let data: RunConventionEvalJobData | null = null
  const started = await startConventionEval(config, provider, admin, async (sent) => {
    data = sent
  })
  if ('notFound' in started) throw new PilotRefusal(`${options.kind} is behind its own flag`)
  if ('refusal' in started) throw new PilotRefusal(`the start refuses: ${started.refusal}`)
  if ('busy' in started) throw new PilotRefusal('a convention test already runs for the admin')
  const jobData = data as RunConventionEvalJobData | null
  if (!jobData) throw new PilotRefusal('no job data')
  print(`run #${String(started.runId)} queued; job data keys: ${Object.keys(jobData).join(',')}`)

  const begun = Date.now()
  let seen = 0
  const progress = setInterval(() => {
    void ConventionEvalTrial.query()
      .where('runId', started.runId)
      .where('id', '>', seen)
      .orderBy('id')
      .then((trials) => {
        for (const trial of trials) {
          seen = trial.id
          print(
            `trial ${trial.taskId} ${trial.condition} #${String(trial.attempt)}: success=${trial.successVerdict ?? '-'} compliance=${trial.complianceVerdict ?? '-'} error=${trial.errorReason ?? '-'} tokens in=${String(trial.inputTokens)} cached=${String(trial.cachedInputTokens)} write=${String(trial.cacheWriteTokens)} out=${String(trial.outputTokens)} ${String(Math.round(trial.durationMs / 1000))}s`,
          )
        }
      })
      .catch(() => undefined)
  }, 2000)
  try {
    const job = new RunConventionEvalJob()
    job.data = jobData
    job.logger = logger
    await job.process()
  } finally {
    clearInterval(progress)
  }
  await printSummary(started.runId, Date.now() - begun, print)
}

/** Held n/k per rule and condition, success and compliance apart, then the run's totals. */
async function printSummary(runId: number, durationMs: number, print: Print) {
  const run = await ConventionEvalRun.findOrFail(runId)
  const trials = await ConventionEvalTrial.query().where('runId', runId).orderBy('id')
  const groups = new Map<string, ConventionEvalTrial[]>()
  for (const trial of trials) {
    const key = `${trial.ruleSlot}=${trial.ruleId} ${trial.condition}`
    groups.set(key, [...(groups.get(key) ?? []), trial])
  }
  print(
    `status=${run.status} reason=${run.failureReason ?? 'none'} trials=${String(trials.length)}/${String(run.trialCount)}`,
  )
  for (const [key, group] of groups) {
    const held = (verdict: 'successVerdict' | 'complianceVerdict') =>
      group.filter((trial) => trial[verdict] === 'pass').length
    print(
      `${key}: success ${String(held('successVerdict'))}/${String(group.length)}, compliance ${String(held('complianceVerdict'))}/${String(group.length)}`,
    )
  }
  print(
    `tokens: input=${String(run.inputTokens)} cached=${String(run.cachedInputTokens)} cacheWrite=${String(run.cacheWriteTokens)} output=${String(run.outputTokens)}; equivalent cost=${run.costUsd === null ? 'unpriced' : `$${String(run.costUsd)}`}; duration=${String(Math.round(durationMs / 1000))}s`,
  )
  const left = await (await app.container.make(EvalSandboxes)).list({
    [EVAL_SANDBOX_METADATA.runKey]: String(runId),
  })
  print(`sandboxes left for the run: ${String(left.length)}`)
}

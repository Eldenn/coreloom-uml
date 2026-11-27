import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { CATALOG_VERSION } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import {
  AGENT_CONFIG_NOT_FOUND,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import {
  CONVENTION_EVAL_BUSY,
  CONVENTION_EVAL_LIMITS,
  CONVENTION_EVAL_RUN_NOT_FOUND,
  CONVENTION_EVALS_NOT_FOUND,
  EvalFailureReason,
  EvalRefusal,
  EvalRunStatus,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import {
  serializeConventionEvalRun,
  serializeConventionEvalTrial,
} from '#app/convention-evals/serializers/convention-eval-serializer'
import { acquireEvalLock, releaseEvalLock } from '#app/convention-evals/services/eval-lock'
import { type EvalPlan, planEval } from '#app/convention-evals/services/eval-plan'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'
import {
  listConventionEvalsInput,
  planConventionEvalInput,
  startConventionEvalInput,
} from '#app/convention-evals/validators/convention-evals-input'
import type {
  ConventionEvalPlanOutput,
  ConventionEvalRunDetailOutput,
  ConventionEvalRunListOutput,
  ConventionEvalStartOutput,
} from '#app/convention-evals/validators/convention-evals-output'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import RunConventionEvalJob from '#app/jobs/run-convention-eval_job'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { paginate } from '#app/shared/pagination/paginate'
import type User from '#app/users/models/user'

/** What the screen is told when the plan refuses a run. */
const REFUSAL_MESSAGES: Readonly<Record<EvalRefusal, string>> = {
  [EvalRefusal.NoTestableRule]: 'None of the ready-made rules held can be tested yet.',
  [EvalRefusal.NoCredential]: 'This provider has no saved key or connected subscription.',
  [EvalRefusal.ProviderSettings]: 'These provider settings cannot be called.',
  [EvalRefusal.OverCap]: 'Even the lower estimate of this test passes its cost cap.',
}

/** Behind the `convention-evals` flag and E2B: 404 to anyone without either. */
async function available(user: User): Promise<boolean> {
  if (!(await app.container.make(EvalSandboxes)).configured()) return false
  return isFeatureEnabled(FeatureFlagKey.ConventionEvals, user)
}

const planOutput = (plan: EvalPlan): ConventionEvalPlanOutput => ({
  path: plan.path,
  agent: plan.agent,
  label: plan.label,
  rules: plan.rules,
  tasks: plan.tasks,
  conditions: [...plan.conditions],
  attempts: plan.attempts,
  trials: plan.trials,
  estimate: plan.estimate,
  pricesCheckedOn: plan.pricesCheckedOn,
  capUsd: plan.capUsd,
  maxTokens: plan.maxTokens,
  refusal: plan.refusal,
  testable: plan.testable,
})

/**
 * Convention tests of an agent configuration, for its owner (404 otherwise, and to everyone while
 * the `convention-evals` flag is off). Starting one answers 202 at once with the run id: a test
 * lasts minutes, longer than the production proxy keeps a request. The run is the job's
 * (`RunConventionEvalJob`): these routes call no model and reach no sandbox.
 */
export default class ConventionEvalsController {
  /** `GET /agent-configs/:id/evals/plan?kind=&model=`: what a test would run, or why it cannot. */
  async plan({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await available(user))) return response.notFound(CONVENTION_EVALS_NOT_FOUND)
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    const { kind, model } = await request.validateUsing(planConventionEvalInput, {
      data: request.qs(),
    })
    const plan = await planEval(config, { kind, model }, user)
    if ('notFound' in plan) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    return response.ok(planOutput(plan))
  }

  /** `POST /agent-configs/:id/evals`: starts a test; 409 while one runs for the account. */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await available(user))) return response.notFound(CONVENTION_EVALS_NOT_FOUND)
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    const { provider } = await request.validateUsing(startConventionEvalInput)

    const plan = await planEval(config, provider, user)
    if ('notFound' in plan) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    if (plan.refusal) {
      return response.unprocessableEntity({
        error: { message: REFUSAL_MESSAGES[plan.refusal] },
        refusal: plan.refusal,
      })
    }
    if (!(await acquireEvalLock(user.id, plan.path))) {
      return response.conflict(CONVENTION_EVAL_BUSY)
    }

    let run: ConventionEvalRun | null = null
    try {
      run = await ConventionEvalRun.create({
        userId: user.id,
        agentConfigId: config.id,
        path: plan.path,
        agent: plan.agent,
        providerKind: provider.kind,
        model: provider.model,
        status: EvalRunStatus.Queued,
        failureReason: null,
        capUsd: CONVENTION_EVAL_LIMITS.capUsd,
        estimateLowUsd: plan.estimate?.lowUsd ?? null,
        estimateHighUsd: plan.estimate?.highUsd ?? null,
        pricesCheckedOn: plan.pricesCheckedOn,
        costUsd: null,
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        trialCount: plan.trials,
        configRevision: config.revision,
        catalogVersion: CATALOG_VERSION,
        startedAt: null,
        endedAt: null,
      })
      // Ids and kinds only: the job resolves the credential itself.
      await RunConventionEvalJob.dispatch({
        runId: run.id,
        provider: { kind: provider.kind, model: provider.model },
      })
    } catch (error) {
      if (run) {
        run.status = EvalRunStatus.Failed
        run.failureReason = EvalFailureReason.RunnerFailed
        await run.save().catch(() => undefined)
      }
      await releaseEvalLock(user.id)
      throw error
    }
    logger.info(
      { runId: run.id, agentConfigId: config.id, kind: provider.kind, trials: plan.trials },
      'convention test queued',
    )
    const output: ConventionEvalStartOutput = { runId: run.id }
    return response.accepted(output)
  }

  /** `GET /agent-configs/:id/evals`: the configuration's tests, newest first. */
  async index({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await available(user))) return response.notFound(CONVENTION_EVALS_NOT_FOUND)
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    const pagination = await request.validateUsing(listConventionEvalsInput, {
      data: request.qs(),
    })
    const output: ConventionEvalRunListOutput = await paginate(
      ConventionEvalRun.query().where('agentConfigId', config.id).orderBy('id', 'desc'),
      pagination,
      serializeConventionEvalRun,
    )
    return response.ok(output)
  }

  /** `GET /agent-configs/:id/evals/:runId`: one test and its trials, polled while it runs. */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await available(user))) return response.notFound(CONVENTION_EVALS_NOT_FOUND)
    const config = await findOwnedAgentConfig(params.id, user)
    if (!config) return response.notFound(AGENT_CONFIG_NOT_FOUND)
    const run = await ConventionEvalRun.query()
      .where('id', params.runId)
      .where('agentConfigId', config.id)
      .preload('trials', (query) => query.orderBy('id', 'asc'))
      .first()
    if (!run) return response.notFound(CONVENTION_EVAL_RUN_NOT_FOUND)
    const output: ConventionEvalRunDetailOutput = {
      run: serializeConventionEvalRun(run),
      trials: run.trials.map(serializeConventionEvalTrial),
    }
    return response.ok(output)
  }
}

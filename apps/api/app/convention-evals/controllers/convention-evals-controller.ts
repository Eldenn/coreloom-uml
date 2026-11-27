import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import {
  AGENT_CONFIG_NOT_FOUND,
  findOwnedAgentConfig,
} from '#app/agent-configs/services/owned-agent-config'
import {
  CONVENTION_EVAL_BUSY,
  CONVENTION_EVAL_RUN_NOT_FOUND,
  CONVENTION_EVALS_NOT_FOUND,
  EvalRefusal,
} from '#app/convention-evals/constants/convention-evals'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import {
  serializeConventionEvalRun,
  serializeConventionEvalTrial,
} from '#app/convention-evals/serializers/convention-eval-serializer'
import { type EvalPlan, planEval } from '#app/convention-evals/services/eval-plan'
import EvalSandboxes from '#app/convention-evals/services/eval-sandbox'
import { startConventionEval } from '#app/convention-evals/services/eval-start'
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
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'
import { paginate } from '#app/shared/pagination/paginate'
import type User from '#app/users/models/user'

/** What the screen is told when the plan refuses a run. */
const REFUSAL_MESSAGES: Readonly<Record<EvalRefusal, string>> = {
  [EvalRefusal.NoTestableRule]: 'None of the ready-made rules held can be tested yet.',
  [EvalRefusal.NoCredential]: 'This provider has no saved key or connected subscription.',
  [EvalRefusal.ProviderSettings]: 'These provider settings cannot be called.',
  [EvalRefusal.OverCap]: 'Even the lower estimate of this test passes its cost cap.',
  [EvalRefusal.CliPathUnavailable]:
    'This test runs your key in a sandbox, which is not available yet.',
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

    const started = await startConventionEval(config, provider, user)
    if ('notFound' in started) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    if ('refusal' in started) {
      return response.unprocessableEntity({
        error: { message: REFUSAL_MESSAGES[started.refusal] },
        refusal: started.refusal,
      })
    }
    if ('busy' in started) return response.conflict(CONVENTION_EVAL_BUSY)
    const output: ConventionEvalStartOutput = { runId: started.runId }
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

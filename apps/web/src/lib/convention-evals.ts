// Convention tests of an agent configuration (behind `convention-evals`): what a test would run
// with the provider this browser keeps (`GET …/evals/plan`), starting one (`POST …/evals`, 202
// with its id at once, 409 while one runs for the account), one run asked again while it goes
// (`GET …/evals/:runId`) and the configuration's past runs (`GET …/evals`), asked again while one
// of them goes. The API runs the trials in its worker; these routes call no model.
import { skipToken, useMutation, useQuery } from '@tanstack/react-query'

import { client } from '@/lib/client'
import { isRunActive } from '@/lib/convention-eval-results'
import { callBody, type StoredProvider } from '@/lib/llm-provider-body'
import { queryClient } from '@/lib/query'
import { jobLaunched } from '@/lib/queue-jobs'

/** How often the screen asks how a running test stands. */
const RUN_POLL_INTERVAL_MS = 3000
/** Past runs per page. */
export const EVAL_RUNS_PER_PAGE = 10

export const conventionEvalKeys = {
  all: (configId: number) => ['agent-configs', 'detail', configId, 'evals'] as const,
  plan: (configId: number, provider: StoredProvider | null) =>
    [
      'agent-configs',
      'detail',
      configId,
      'evals',
      'plan',
      provider?.kind,
      provider?.model,
    ] as const,
  runs: (configId: number) => ['agent-configs', 'detail', configId, 'evals', 'runs'] as const,
  runsPage: (configId: number, page: number) =>
    ['agent-configs', 'detail', configId, 'evals', 'runs', page] as const,
  run: (configId: number, runId: number) =>
    ['agent-configs', 'detail', configId, 'evals', 'run', runId] as const,
}

/** What a test would run with this provider, or why it cannot; not asked without a provider. */
export function useEvalPlan(configId: number, provider: StoredProvider | null) {
  return useQuery({
    queryKey: conventionEvalKeys.plan(configId, provider),
    queryFn: provider
      ? () =>
          client.api.agentConfigs.evals.plan({
            params: { id: configId },
            query: { kind: provider.kind, model: provider.model },
          })
      : skipToken,
    retry: false,
  })
}

/**
 * The configuration's runs, newest first, asked again while one of the page is queued or running,
 * so a run left or reloaded meanwhile still ends in the list. A 404 means the feature cannot run
 * on this server.
 */
export function useEvalRuns(configId: number, page: number) {
  return useQuery({
    queryKey: conventionEvalKeys.runsPage(configId, page),
    queryFn: () =>
      client.api.agentConfigs.evals.index({
        params: { id: configId },
        query: { page, perPage: EVAL_RUNS_PER_PAGE },
      }),
    retry: false,
    placeholderData: (previous) => previous,
    refetchInterval: (query) =>
      query.state.data?.data.some((run) => isRunActive(run.status)) ? RUN_POLL_INTERVAL_MS : false,
  })
}

/** One run and its trials, asked again while it is queued or running, then left alone. */
export function useEvalRun(configId: number, runId: number | null) {
  return useQuery({
    queryKey: conventionEvalKeys.run(configId, runId ?? 0),
    queryFn:
      runId === null
        ? skipToken
        : () => client.api.agentConfigs.evals.show({ params: { id: configId, runId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status
      if (query.state.status === 'error') return false
      return status === undefined || isRunActive(status) ? RUN_POLL_INTERVAL_MS : false
    },
  })
}

/** Starts a test with the provider this browser keeps: its kind and model, never a key. */
export function useStartEval(configId: number) {
  return useMutation({
    mutationFn: (provider: StoredProvider) =>
      client.api.agentConfigs.evals.store({ params: { id: configId }, body: callBody(provider) }),
    onSuccess: () => {
      jobLaunched()
      return queryClient.invalidateQueries({ queryKey: conventionEvalKeys.runs(configId) })
    },
  })
}

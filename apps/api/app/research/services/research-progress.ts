import redis from '@adonisjs/redis/services/main'
import type { ResearchTools } from '@coreloom-uml/llm'
import {
  RESEARCH_LOCK_SECONDS,
  RESEARCH_STEP_LABEL_MAX_LENGTH,
  RESEARCH_STEPS_MAX,
} from '#app/research/constants/research'

export const ResearchStepKind = { Page: 'page', Command: 'command' } as const
export type ResearchStepKind = (typeof ResearchStepKind)[keyof typeof ResearchStepKind]

export const ResearchStepState = { Running: 'running', Done: 'done', Failed: 'failed' } as const
export type ResearchStepState = (typeof ResearchStepState)[keyof typeof ResearchStepState]

/** One thing the model did in the sandbox: the address read or the command run, never its result. */
export type ResearchStep = { kind: ResearchStepKind; label: string; state: ResearchStepState }

function progressKey(userId: number): string {
  return `research:steps:${userId}`
}

/** The steps of the account's running research, in order; none when no research runs. */
export async function readProgress(userId: number): Promise<ResearchStep[]> {
  const stored = await redis.get(progressKey(userId))
  return stored ? (JSON.parse(stored) as ResearchStep[]) : []
}

/**
 * The same tools, each call noted for the owner to follow on the screen while the research runs.
 * The one place an address or a command of a research is kept: in Redis, for the account that
 * asked, until `clear` (the research's `finally`) or `RESEARCH_LOCK_SECONDS` at the latest.
 * A note that cannot be written never fails the research.
 */
export function trackProgress(
  userId: number,
  tools: ResearchTools,
): { tools: ResearchTools; clear(): Promise<void> } {
  const steps: ResearchStep[] = []
  const save = () =>
    redis
      .set(progressKey(userId), JSON.stringify(steps), 'EX', RESEARCH_LOCK_SECONDS)
      .catch(() => null)

  async function noted<T>(
    kind: ResearchStepKind,
    label: string,
    work: () => Promise<T>,
    worked: (result: T) => boolean,
  ): Promise<T> {
    if (steps.length >= RESEARCH_STEPS_MAX) return work()
    const step: ResearchStep = {
      kind,
      label: label.slice(0, RESEARCH_STEP_LABEL_MAX_LENGTH),
      state: ResearchStepState.Running,
    }
    steps.push(step)
    await save()
    try {
      const result = await work()
      step.state = worked(result) ? ResearchStepState.Done : ResearchStepState.Failed
      return result
    } catch (error) {
      step.state = ResearchStepState.Failed
      throw error
    } finally {
      await save()
    }
  }

  return {
    tools: {
      readPage: (url, signal) =>
        noted(
          ResearchStepKind.Page,
          url,
          () => tools.readPage(url, signal),
          (page) => page !== null,
        ),
      run: (command, signal) =>
        noted(
          ResearchStepKind.Command,
          command,
          () => tools.run(command, signal),
          (outcome) => outcome.exitCode === 0,
        ),
    },
    async clear() {
      await redis.del(progressKey(userId)).catch(() => null)
    },
  }
}

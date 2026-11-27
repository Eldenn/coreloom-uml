import { generateText, type LanguageModel, type LanguageModelUsage, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { failureReason, type LlmFailureReason } from './failure.ts'
import { cut, unlessAborted } from './research.ts'

/**
 * One trial of the convention tests run by our own harness (the path for subscriptions and the
 * kinds no coding agent's CLI serves): the user's model works in a repository through one tool,
 * `run`, whose commands the caller executes in a sandbox cut off every network that holds no
 * secret. The model is called from the server, so no credential ever enters the sandbox. In the
 * `full` condition the repository's AGENTS.md is given as a coding agent's own instruction file
 * would be; in `none` there is none. Nothing is graded here: the caller grades the repository.
 */

export const CODING_TRIAL = {
  /** Calls to the model: commands, then the answer. */
  maxSteps: 30,
  /** The agent phase of one trial, as Harbor's agent timeout. */
  timeoutMs: 600_000,
  commandLength: 4000,
  /** One command's output shown to the model. */
  outputChars: 8000,
  /** The transcript kept for the caller to filter and store. */
  transcriptChars: 60_000,
  maxOutputTokens: 4000,
} as const

export const CODING_TRIAL_INSTRUCTIONS = [
  'You are a coding agent working in a Git repository on a Linux machine with no network. Do what the user asks, completely, then answer in one or two sentences.',
  '"run" runs one bash command from the root of the repository and answers its exit code and its output. node, npm, pnpm and git are installed; nothing can be downloaded except what is already cached on the machine.',
  'Keep each output short (a pattern, a line range), since long output is cut.',
].join('\n')

/** How AGENTS.md reaches the model in the `full` condition: as the repository's own instructions. */
export function projectInstructionsBlock(agentsMd: string): string {
  return [
    'The repository holds instructions for coding agents, in AGENTS.md. Follow them as you work:',
    '<agents-md path="AGENTS.md">',
    agentsMd.replaceAll('</agents-md>', '<\\/agents-md>'),
    '</agents-md>',
  ].join('\n')
}

export type CodingTrialUsage = {
  /** Input tokens read neither from nor into the cache. */
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
}

export const NO_USAGE: CodingTrialUsage = { input: 0, cachedInput: 0, cacheWrite: 0, output: 0 }

export function addUsage(a: CodingTrialUsage, b: CodingTrialUsage): CodingTrialUsage {
  return {
    input: a.input + b.input,
    cachedInput: a.cachedInput + b.cachedInput,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    output: a.output + b.output,
  }
}

/** The AI SDK's usage of one step, by price class. */
export function stepUsage(usage: LanguageModelUsage): CodingTrialUsage {
  const cachedInput = usage.inputTokenDetails?.cacheReadTokens ?? 0
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0
  const input =
    usage.inputTokenDetails?.noCacheTokens ??
    Math.max((usage.inputTokens ?? 0) - cachedInput - cacheWrite, 0)
  return { input, cachedInput, cacheWrite, output: usage.outputTokens ?? 0 }
}

export type CodingTrialInput = {
  /** What the user asks, as the task words it. */
  instruction: string
  /** The repository's AGENTS.md in the `full` condition; null in `none`. */
  agentsMd: string | null
  /** Runs one command in the sandbox. `signal` aborts when the trial is stopped. */
  run(command: string, signal?: AbortSignal): Promise<{ exitCode: number; output: string }>
  /** Called after each call to the model with what it used, for the caller's cost cap. */
  onUsage?(usage: CodingTrialUsage): void
}

export type CodingTrialResult = {
  /**
   * The model's text and each command with its output, unfiltered and capped: the caller filters
   * it for secrets before anything stores or logs it.
   */
  transcript: string
  usage: CodingTrialUsage
  steps: number
  commands: number
  /** Why the trial stopped early: the provider's failure, a timeout, or `aborted`. */
  failure: LlmFailureReason | 'aborted' | null
}

/**
 * Runs the trial. Never throws: a failure of the model ends the trial with what was done so far
 * (the repository is graded as it is) and its reason.
 */
export async function runCodingTrial(
  model: LanguageModel,
  input: CodingTrialInput,
  options: { timeoutMs?: number; maxSteps?: number; signal?: AbortSignal } = {},
): Promise<CodingTrialResult> {
  const parts: string[] = []
  let length = 0
  const keep = (text: string) => {
    if (length >= CODING_TRIAL.transcriptChars) return
    const kept = cut(text, CODING_TRIAL.transcriptChars - length)
    parts.push(kept)
    length += kept.length
  }
  let usage = NO_USAGE
  let steps = 0
  let commands = 0

  const tools = {
    run: tool({
      description:
        'Runs one bash command from the root of the repository and answers its exit code and its output.',
      inputSchema: z.object({
        command: z.string().min(1).max(CODING_TRIAL.commandLength).describe('One bash command'),
      }),
      execute: async ({ command }, { abortSignal }) => {
        commands++
        const ran = await unlessAborted(input.run(command, abortSignal), abortSignal)
        const shown = cut(ran.output, CODING_TRIAL.outputChars)
        keep(`$ ${command}\n${shown}\n[exit ${String(ran.exitCode)}]\n`)
        return `Exit code: ${String(ran.exitCode)}\n${shown}`
      },
    }),
  }

  const instructions = input.agentsMd
    ? `${CODING_TRIAL_INSTRUCTIONS}\n\n${projectInstructionsBlock(input.agentsMd)}`
    : CODING_TRIAL_INSTRUCTIONS
  let failure: CodingTrialResult['failure'] = null
  try {
    await generateText({
      model,
      instructions,
      prompt: input.instruction,
      tools,
      stopWhen: stepCountIs(options.maxSteps ?? CODING_TRIAL.maxSteps),
      temperature: 0,
      maxOutputTokens: CODING_TRIAL.maxOutputTokens,
      timeout: options.timeoutMs ?? CODING_TRIAL.timeoutMs,
      ...(options.signal ? { abortSignal: options.signal } : {}),
      maxRetries: 0,
      telemetry: { isEnabled: false },
      onStepEnd: (step) => {
        steps++
        const used = stepUsage(step.usage)
        usage = addUsage(usage, used)
        if (step.text.trim()) keep(`${step.text.trim()}\n`)
        input.onUsage?.(used)
      },
    })
  } catch (error) {
    failure = options.signal?.aborted ? 'aborted' : failureReason(error)
  }
  return { transcript: parts.join(''), usage, steps, commands, failure }
}

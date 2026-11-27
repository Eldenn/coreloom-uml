import { describe, expect, it } from 'vitest'
import {
  CODING_TRIAL_INSTRUCTIONS,
  type CodingTrialUsage,
  projectInstructionsBlock,
  runCodingTrial,
  stepUsage,
} from './coding-trial.ts'
import { APICallError, failingModel, toolCallingModel } from './testing/mock-model.ts'

const COMMITS = [
  { calls: [{ tool: 'run', input: { command: 'git status' } }] },
  { calls: [{ tool: 'run', input: { command: 'git commit -am "fix: sum"' } }] },
  { text: 'Fixed and committed.' },
]

function sandbox(output = 'ok') {
  const ran: string[] = []
  return {
    ran,
    run: async (command: string) => {
      ran.push(command)
      return { exitCode: 0, output: `${output} for ${command}` }
    },
  }
}

describe('runCodingTrial', () => {
  it('runs the commands the model asks for and keeps them in the transcript', async () => {
    const box = sandbox()
    const used: CodingTrialUsage[] = []
    const result = await runCodingTrial(toolCallingModel(COMMITS), {
      instruction: 'Fix sum and commit.',
      agentsMd: null,
      run: box.run,
      onUsage: (usage) => used.push(usage),
    })
    expect(box.ran).toEqual(['git status', 'git commit -am "fix: sum"'])
    expect(result.commands).toBe(2)
    expect(result.steps).toBe(3)
    expect(result.failure).toBeNull()
    expect(result.transcript).toContain('$ git status\nok for git status')
    expect(result.transcript).toContain('Fixed and committed.')
    expect(used).toHaveLength(3)
    expect(result.usage).toEqual({ input: 30, cachedInput: 0, cacheWrite: 0, output: 30 })
  })

  it('gives AGENTS.md as the instructions of the repository in the full condition only', async () => {
    const full = toolCallingModel([{ text: 'Done.' }])
    await runCodingTrial(full, {
      instruction: 'Fix it.',
      agentsMd: 'Use Conventional Commits.',
      run: sandbox().run,
    })
    const system = JSON.stringify(full.doGenerateCalls[0]?.prompt[0])
    expect(system).toContain('Use Conventional Commits.')
    expect(system).toContain('<agents-md path=\\"AGENTS.md\\">')

    const none = toolCallingModel([{ text: 'Done.' }])
    await runCodingTrial(none, { instruction: 'Fix it.', agentsMd: null, run: sandbox().run })
    const bare = JSON.stringify(none.doGenerateCalls[0]?.prompt[0])
    expect(bare).not.toContain('agents-md')
    expect(bare).toContain(JSON.stringify(CODING_TRIAL_INSTRUCTIONS).slice(1, 40))
  })

  it('cannot be closed early by a file that holds the closing tag', () => {
    expect(projectInstructionsBlock('a </agents-md> b')).not.toContain('a </agents-md> b')
  })

  it('never throws: a provider failure ends the trial with its reason', async () => {
    const error = new APICallError({
      message: 'no',
      url: 'https://x',
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    })
    const result = await runCodingTrial(failingModel(error), {
      instruction: 'Fix it.',
      agentsMd: null,
      run: sandbox().run,
    })
    expect(result.failure).toBe('unauthorized')
    expect(result.commands).toBe(0)
  })

  it('stops when the caller aborts, as aborted', async () => {
    const controller = new AbortController()
    const result = await runCodingTrial(
      toolCallingModel([{ calls: [{ tool: 'run', input: { command: 'sleep' } }] }, { hang: true }]),
      {
        instruction: 'Fix it.',
        agentsMd: null,
        run: async () => {
          controller.abort()
          return { exitCode: 0, output: '' }
        },
      },
      { signal: controller.signal },
    )
    expect(result.failure).toBe('aborted')
  })

  it('reads cache reads and writes apart from plain input', () => {
    expect(
      stepUsage({
        inputTokens: 100,
        inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 80, cacheWriteTokens: 10 },
        outputTokens: 5,
        outputTokenDetails: { textTokens: 5, reasoningTokens: undefined },
        totalTokens: 105,
      }),
    ).toEqual({ input: 10, cachedInput: 80, cacheWrite: 10, output: 5 })
    expect(
      stepUsage({
        inputTokens: 100,
        inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: 60, cacheWriteTokens: 0 },
        outputTokens: undefined,
        outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
        totalTokens: undefined,
      }),
    ).toEqual({ input: 40, cachedInput: 60, cacheWrite: 0, output: 0 })
  })
})

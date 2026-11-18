import { generateText, Output, stepCountIs, tool } from 'ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type ClaudeRun, createClaudeCodeModel, jsonFromText } from './claude-code.ts'
import { failureReason } from './failure.ts'
import { createLanguageModel } from './provider.ts'

type Outcome = Awaited<ReturnType<ClaudeRun>>

const CREDENTIAL = { kind: 'claude-code', configDir: '/data/claude/42' } as const

function fakeRun(outcome: Partial<Outcome> & { json?: unknown }) {
  const calls: Parameters<ClaudeRun>[] = []
  const run: ClaudeRun = async (...args) => {
    calls.push(args)
    return {
      exitCode: outcome.exitCode ?? 0,
      stdout: outcome.stdout ?? JSON.stringify(outcome.json ?? {}),
      timedOut: outcome.timedOut ?? false,
      missing: outcome.missing ?? false,
    }
  }
  return { run, calls }
}

const success = (extra: object) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  usage: { input_tokens: 12, output_tokens: 3 },
  ...extra,
})

async function reasonOf(outcome: Partial<Outcome> & { json?: unknown }) {
  const { run } = fakeRun(outcome)
  const error = await generateText({
    model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
    prompt: 'P',
    maxRetries: 0,
  }).catch((caught: unknown) => caught)
  return failureReason(error)
}

describe('createClaudeCodeModel', () => {
  it('runs the binary in print mode, without tools, the prompt on stdin', async () => {
    const { run, calls } = fakeRun({ json: success({ result: 'OK' }) })
    const result = await generateText({
      model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
      system: 'Be brief.',
      prompt: 'Reply with OK.',
      maxRetries: 0,
    })
    expect(result.text).toBe('OK')
    expect(result.usage.inputTokens).toBe(12)
    const [args, options] = calls[0] ?? []
    expect(args).toEqual([
      '-p',
      '--output-format',
      'json',
      '--model=sonnet',
      '--tools',
      '',
      '--no-session-persistence',
      '--safe-mode',
      '--strict-mcp-config',
      '--system-prompt',
      'Be brief.',
    ])
    expect(options?.stdin).toBe('Reply with OK.')
    expect(options?.configDir).toBe('/data/claude/42')
  })

  it('keeps a model name that looks like a flag in its own argument', async () => {
    const { run, calls } = fakeRun({ json: success({ result: 'OK' }) })
    await generateText({
      model: createClaudeCodeModel('--evil', CREDENTIAL, run),
      prompt: 'P',
      maxRetries: 0,
    })
    expect(calls[0]?.[0]).toContain('--model=--evil')
    expect(calls[0]?.[0]).not.toContain('--evil')
  })

  it('asks for a JSON schema and reads the structured output', async () => {
    const { run, calls } = fakeRun({
      json: success({ result: 'done', structured_output: { answer: 'yes' } }),
    })
    const result = await generateText({
      model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
      prompt: 'P',
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      maxRetries: 0,
    })
    expect(result.output).toEqual({ answer: 'yes' })
    const args = calls[0]?.[0] ?? []
    const schema = JSON.parse(args[args.indexOf('--json-schema') + 1] ?? '{}')
    expect(schema.properties.answer.type).toBe('string')
  })

  it('reads JSON out of the text when no structured output came back', async () => {
    const { run } = fakeRun({
      json: success({ result: 'Here it is:\n```json\n{"answer":"yes"}\n```' }),
    })
    const result = await generateText({
      model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
      prompt: 'P',
      output: Output.object({ schema: z.object({ answer: z.string() }) }),
      maxRetries: 0,
    })
    expect(result.output).toEqual({ answer: 'yes' })
  })

  it('reduces each failure to a reason', async () => {
    expect(await reasonOf({ missing: true, exitCode: null })).toBe('unreachable')
    expect(await reasonOf({ timedOut: true, exitCode: null })).toBe('timeout')
    expect(
      await reasonOf({
        exitCode: 1,
        json: { is_error: true, result: 'Not logged in · Please run /login' },
      }),
    ).toBe('subscription_expired')
    expect(
      await reasonOf({
        exitCode: 1,
        json: { is_error: true, result: 'Credit balance is too low' },
      }),
    ).toBe('rate_limited')
    expect(await reasonOf({ exitCode: 2, stdout: 'garbage' })).toBe('unknown')
  })
})

describe('jsonFromText', () => {
  it('keeps the object, without a fence or prose around it', () => {
    expect(jsonFromText('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(jsonFromText('Sure: {"a":{"b":2}} done')).toBe('{"a":{"b":2}}')
    expect(jsonFromText('no json')).toBe('no json')
  })
})

describe('createLanguageModel', () => {
  it('refuses a key for a subscription, and a subscription for a key kind', () => {
    expect(() => createLanguageModel({ kind: 'claude-code', model: 'sonnet' }, 'key')).toThrow()
    expect(() => createLanguageModel({ kind: 'anthropic', model: 'x' }, CREDENTIAL)).toThrow()
    expect(() =>
      createLanguageModel({ kind: 'claude-code', model: 'sonnet' }, CREDENTIAL),
    ).toThrow()
    const { run } = fakeRun({})
    expect(
      createLanguageModel({ kind: 'claude-code', model: 'sonnet' }, CREDENTIAL, { claudeRun: run }),
    ).toBeTruthy()
  })
})

describe('abort', () => {
  it('passes the caller timeout to the binary, and reads an abort as a timeout', async () => {
    const signals: (AbortSignal | undefined)[] = []
    const run: ClaudeRun = (_args, options) =>
      new Promise((resolve) => {
        signals.push(options.signal)
        options.signal?.addEventListener('abort', () =>
          resolve({ exitCode: null, stdout: '', timedOut: true, missing: false }),
        )
      })
    const error = await generateText({
      model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
      prompt: 'P',
      timeout: 50,
      maxRetries: 0,
    }).catch((caught: unknown) => caught)
    expect(signals[0]).toBeInstanceOf(AbortSignal)
    expect(failureReason(error)).toBe('timeout')
  })
})

describe('tools', () => {
  function sequence(answers: unknown[]) {
    const calls: Parameters<ClaudeRun>[] = []
    const run: ClaudeRun = async (...args) => {
      const json = success({ structured_output: answers[calls.length] })
      calls.push(args)
      return { exitCode: 0, stdout: JSON.stringify(json), timedOut: false, missing: false }
    }
    return { run, calls }
  }
  const read: string[] = []
  const tools = {
    read_page: tool({
      description: 'Reads one web page.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        read.push(url)
        return 'PAGE TEXT'
      },
    }),
  }

  it('asks the binary for one action a step, and runs the tool itself', async () => {
    const { run, calls } = sequence([
      { action: 'read_page', input: { url: 'https://a.example/' } },
      { action: 'answer', answer: 'What the page says.' },
    ])
    const result = await generateText({
      model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
      system: 'Research.',
      prompt: 'Read https://a.example/',
      tools,
      stopWhen: stepCountIs(4),
      maxRetries: 0,
    })
    expect(result.text).toBe('What the page says.')
    expect(read).toEqual(['https://a.example/'])
    expect(calls).toHaveLength(2)

    const [args] = calls[0] ?? []
    // The binary still has no tool of its own: it only says which of ours to run.
    expect(args?.[args.indexOf('--tools') + 1]).toBe('')
    const schema = JSON.parse(args?.[(args?.indexOf('--json-schema') ?? 0) + 1] ?? '{}')
    expect(schema.properties.action.enum).toEqual(['read_page', 'answer'])
    const system = args?.[(args?.indexOf('--system-prompt') ?? 0) + 1] ?? ''
    expect(system).toContain('Research.')
    expect(system).toContain('read_page')
    expect(system).toContain('Reads one web page.')

    // The next step reads what was asked and what came back.
    const stdin = calls[1]?.[1].stdin ?? ''
    expect(stdin).toContain('Read https://a.example/')
    expect(stdin).toContain('"url":"https://a.example/"')
    expect(stdin).toContain('PAGE TEXT')
  })

  it('reads an action that names no tool as the answer', async () => {
    const { run } = sequence([{ action: 'delete_everything', answer: 'Only this.' }])
    const result = await generateText({
      model: createClaudeCodeModel('sonnet', CREDENTIAL, run),
      prompt: 'P',
      tools,
      stopWhen: stepCountIs(4),
      maxRetries: 0,
    })
    expect(result.text).toBe('Only this.')
    expect(result.toolCalls).toEqual([])
  })
})

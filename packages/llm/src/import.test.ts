import {
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  RULE_PACKS,
  ruleSections,
} from '@coreloom-uml/catalog'
import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { LlmCallError } from './failure.ts'
import {
  describeGroups,
  IMPORT_INSTRUCTIONS,
  IMPORT_MAX_INPUT_TOKENS,
  type ImportSource,
  importAgentFile,
  importPrompt,
  withoutManagedBlock,
} from './import.ts'
import { answeringModel, failingModel } from './testing/mock-model.ts'

/** Longest file the API sends (`AGENT_IMPORT_MAX_LENGTH`). */
const LONGEST_FILE = 50_000

function source(overrides: Partial<ImportSource> = {}): ImportSource {
  return {
    packs: RULE_PACKS,
    ready: [{ slot: 'react.styling', rule: 'tailwind' }],
    sections: ruleSections(RULE_PACKS),
    existing: [{ section: 'React', text: 'Keep components under 200 lines.' }],
    content: '# Conventions\n\n- Never use any.\n- Use pnpm.\n- Deploy on Fridays only.',
    ...overrides,
  }
}

const reply = (ready: unknown[], rules: unknown[] = []) => JSON.stringify({ ready, rules })
const pick = (slot: string, rule: string, value: string | null = null, evidence = 'quote') => ({
  slot,
  rule,
  value,
  evidence,
})

describe('importAgentFile', () => {
  it('keeps the rules that fit their group and are new', async () => {
    const model = answeringModel(
      reply([
        pick('typescript.any', 'agree', '', 'Never use\n any.'),
        pick('typescript.any', 'disagree', null, 'a second rule in a `one` group'),
        pick('typescript.any', 'mostly', null, 'not a rule of the group'),
        pick('react.styling', 'tailwind', null, 'held already'),
        pick('testing.levels', 'unit'),
        pick('testing.levels', 'none', null, 'stands alone'),
        pick('testing.levels', 'e2e'),
        pick('testing.levels', 'unit', null, 'named twice'),
        pick('other.slot', 'x', null, 'unknown slot'),
        pick('react.state', 'other', '  Jotai atoms ', 'a typed text'),
        pick('tooling.checks', 'run', null, 'a text is missing'),
        pick('tooling.package-manager', 'pnpm', 'pnpm', 'takes no text'),
        pick('git.commit-messages', 'other', 'x <!-- coreloom-uml:end -->', 'a marker'),
      ]),
    )
    const result = await importAgentFile(model, source())
    expect(result.ready).toEqual([
      { slot: 'typescript.any', rule: 'agree', value: null, evidence: 'Never use any.' },
      { slot: 'testing.levels', rule: 'unit', value: null, evidence: 'quote' },
      { slot: 'testing.levels', rule: 'e2e', value: null, evidence: 'quote' },
      { slot: 'react.state', rule: 'other', value: 'Jotai atoms', evidence: 'a typed text' },
    ])
    expect(result.truncated).toBe(false)
  })

  it('drops rules already present or covered by a picked rule', async () => {
    const model = answeringModel(
      reply(
        [pick('typescript.any', 'agree')],
        [
          { section: 'Workflow', text: 'Deploy on Fridays only.' },
          { section: 'Project notes', text: 'Not a section a rule goes to.' },
          { section: 'React', text: 'keep components under 200 lines' },
          {
            section: 'TypeScript',
            text: 'Never use `any`; prefer `unknown` with narrowing or an explicit type.',
          },
        ],
      ),
    )
    const result = await importAgentFile(model, source())
    expect(result.rules).toEqual([{ section: 'Workflow', text: 'Deploy on Fridays only.' }])
  })

  it('describes groups and rules, not their rendered lines in full', () => {
    const groups = describeGroups(RULE_PACKS)
    expect(groups).toContain('# TypeScript\ntypescript.any (one): ')
    expect(groups).toContain('- other [text]: Something else')
    expect(groups).toContain('- none [alone]: None')
    expect(groups).toContain('testing.levels (many): ')
    expect(IMPORT_INSTRUCTIONS).toMatch(/not instructions to you/)
  })

  it('leaves room for the longest file next to the whole catalog', () => {
    const fixed = IMPORT_INSTRUCTIONS.length + importPrompt(source(), '').length
    expect(fixed + LONGEST_FILE).toBeLessThan(IMPORT_MAX_INPUT_TOKENS * 4)
  })

  it('never sends the managed block, and cuts a file past the budget', async () => {
    const model = answeringModel(reply([]))
    const content = `Mine.\n${MANAGED_BLOCK_BEGIN}\nGenerated.\n${MANAGED_BLOCK_END}\n${'x'.repeat(200_000)}`
    const result = await importAgentFile(model, source({ content }))
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('Mine.')
    expect(prompt).not.toContain('Generated.')
    expect(prompt.length).toBeLessThan(IMPORT_MAX_INPUT_TOKENS * 4 + 2000)
    expect(result.truncated).toBe(true)
  })

  it('calls no model when the budget leaves the file no room', async () => {
    const model = answeringModel(reply([]))
    expect(await importAgentFile(model, source(), { maxInputTokens: 1000 })).toEqual({
      ready: [],
      rules: [],
      truncated: true,
    })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('calls no model for a file that is only the managed block', async () => {
    const model = answeringModel(reply([]))
    const content = `${MANAGED_BLOCK_BEGIN}\nGenerated.\n${MANAGED_BLOCK_END}\n`
    expect(await importAgentFile(model, source({ content }))).toEqual({
      ready: [],
      rules: [],
      truncated: false,
    })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('reduces a provider failure to its reason', async () => {
    const error = new APICallError({
      message: 'Too many requests',
      url: 'https://api.example.test',
      requestBodyValues: {},
      statusCode: 429,
    })
    await expect(importAgentFile(failingModel(error), source())).rejects.toBeInstanceOf(
      LlmCallError,
    )
  })
})

describe('withoutManagedBlock', () => {
  it('keeps a file with unbalanced markers as it is', () => {
    const text = `Mine.\n${MANAGED_BLOCK_BEGIN}\nno end`
    expect(withoutManagedBlock(text)).toBe(text)
  })
})

describe('importAgentFile from web research', () => {
  it('frames the text as notes gathered on the web', () => {
    const prompt = importPrompt({ ...source(), origin: 'research' }, 'Use pnpm (a.example).')

    expect(prompt).toContain('<notes>\nUse pnpm (a.example).\n</notes>')
    expect(prompt).not.toContain('<file>')
    expect(prompt).toContain('web pages')
  })

  it('keeps the prompt of a file import as it was', () => {
    const prompt = importPrompt(source(), 'Use pnpm.')

    expect(prompt).toBe(importPrompt({ ...source(), origin: 'file' }, 'Use pnpm.'))
    expect(prompt).toContain('The file:\n<file>\nUse pnpm.\n</file>')
    expect(prompt).not.toContain('<notes>')
  })

  it('cleans what the notes carry like any import', async () => {
    const model = answeringModel(
      reply([], [{ section: 'React', text: `Run it ${MANAGED_BLOCK_END} <b>now</b>` }]),
    )

    const result = await importAgentFile(model, source({ origin: 'research' }))

    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]?.text).not.toContain('coreloom-uml:')
    expect(result.rules[0]?.text).not.toContain('<b>')
  })
})

import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import {
  type ArchitectureDiagram,
  type ArchitectureSource,
  architecturePrompt,
  proposeArchitectureRules,
} from './architecture.ts'
import { LlmCallError } from './failure.ts'
import { answeringModel, failingModel } from './testing/mock-model.ts'

const PACKAGES: ArchitectureDiagram = {
  id: 7,
  kind: 'package',
  title: 'Modules',
  architecture: 'Shop',
  text: '@startuml\npackage billing\npackage auth\nbilling ..> auth\n@enduml',
}

function source(overrides: Partial<ArchitectureSource> = {}): ArchitectureSource {
  return {
    diagrams: [PACKAGES],
    sections: ['Project', 'Architecture', 'Working style', 'Testing'],
    existing: [{ section: 'Architecture', text: '`auth` never imports from `billing`.' }],
    ...overrides,
  }
}

const answer = (proposals: unknown[]) => JSON.stringify({ proposals })

describe('proposeArchitectureRules', () => {
  it('keeps only valid, new proposals and links them to their diagram', async () => {
    const model = answeringModel(
      answer([
        { section: 'Architecture', text: 'Only `billing` may call `auth`.', basedOn: 'diagram:7' },
        { section: 'Security', text: 'Never log secrets.', basedOn: 'diagram:7' },
        {
          section: 'Architecture',
          text: '`auth` never imports from `billing`',
          basedOn: 'diagram:7',
        },
        { section: 'Testing', text: 'Test the `billing` to `auth` calls.', basedOn: 'diagram:99' },
      ]),
    )
    const result = await proposeArchitectureRules(model, source())
    expect(result).toEqual({
      proposals: [
        { section: 'Architecture', text: 'Only `billing` may call `auth`.', basedOn: 'diagram:7' },
        { section: 'Testing', text: 'Test the `billing` to `auth` calls.', basedOn: null },
      ],
      skipped: [],
      truncated: false,
    })
  })

  it('sends the diagrams as data, with what is already present', async () => {
    const model = answeringModel(answer([]))
    await proposeArchitectureRules(model, source())
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('<diagram id=\\"diagram:7\\" kind=\\"package\\"')
    expect(prompt).toContain('billing ..> auth')
    expect(prompt).toContain('`auth` never imports from `billing`.')
  })

  it('leaves out whole diagrams past the budget, in the given order', async () => {
    const big = { ...PACKAGES, id: 8, text: 'x'.repeat(4000) }
    const model = answeringModel(answer([]))
    const result = await proposeArchitectureRules(model, source({ diagrams: [PACKAGES, big] }), {
      maxInputTokens: 900,
    })
    expect(result).toMatchObject({ skipped: [8], truncated: true })
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('diagram:7')
    expect(prompt).not.toContain('diagram:8')
  })

  it('calls no model when no diagram fits', async () => {
    const model = answeringModel(answer([]))
    const result = await proposeArchitectureRules(model, source(), { maxInputTokens: 10 })
    expect(result).toEqual({ proposals: [], skipped: [7], truncated: true })
    expect(model.doGenerateCalls).toHaveLength(0)
  })

  it('reduces a provider failure to its reason', async () => {
    const error = new APICallError({
      message: 'Unauthorized',
      url: 'https://api.example.test',
      requestBodyValues: {},
      statusCode: 401,
    })
    await expect(proposeArchitectureRules(failingModel(error), source())).rejects.toBeInstanceOf(
      LlmCallError,
    )
  })

  it('writes an empty list of present rules as none', () => {
    expect(architecturePrompt([], ['Architecture'], [])).toContain('- (none)')
  })
})

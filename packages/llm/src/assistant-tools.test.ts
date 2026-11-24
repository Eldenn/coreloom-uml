import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { AssistantContextFull } from './assistant.ts'
import type { UIMessageChunk } from './assistant-stream.ts'
import {
  ASSISTANT_PROPOSALS_MAX,
  ASSISTANT_READ_RESULT_MAX_LENGTH,
  type AssistantTool,
  AssistantToolKind,
  DESIGN_BRIEF_INSTRUCTIONS,
  NOTHING_TO_READ,
  runAssistantTools,
} from './assistant-tools.ts'
import { LlmCallError } from './failure.ts'
import { type ModelStep, streaming, toolCallingModel } from './testing/mock-model.ts'

const call = (tool: string, input: unknown): ModelStep => ({ calls: [{ tool, input }] })

function fakeTools() {
  const ran: string[] = []
  const tools: AssistantTool[] = [
    {
      name: 'list_projects',
      description: 'Lists the projects.',
      inputSchema: z.object({}),
      kind: AssistantToolKind.Read,
      run: async () => {
        ran.push('list_projects')
        return [{ id: 7, name: 'Shop' }]
      },
    },
    {
      name: 'rename_project',
      description: 'Renames a project.',
      inputSchema: z.object({ projectId: z.number().int().positive(), name: z.string().min(1) }),
      kind: AssistantToolKind.Write,
      run: async (input) => {
        ran.push(`record rename_project ${JSON.stringify(input)}`)
        return (input as { projectId: number }).projectId === 404 ? 'No project has this id.' : null
      },
    },
    {
      name: 'work_on_diagrams',
      description: 'Hands over to the diagram assistant.',
      inputSchema: z.object({ architectureId: z.number().int().positive() }),
      kind: AssistantToolKind.Route,
      run: async (input) => {
        ran.push('route work_on_diagrams')
        return (input as { architectureId: number }).architectureId === 404
          ? 'No architecture has this id.'
          : null
      },
    },
  ]
  return { tools, ran }
}

const base = { history: [], message: 'Rename Shop', locale: 'en' as const, page: null }

function toolResults(model: ReturnType<typeof toolCallingModel>): string {
  return JSON.stringify(
    model.doGenerateCalls.flatMap((item) => item.prompt.filter((m) => m.role === 'tool')),
  )
}

describe('runAssistantTools', () => {
  it('reads with a read tool, then replies', async () => {
    const { tools, ran } = fakeTools()
    const model = toolCallingModel([call('list_projects', {}), { text: '  You have Shop.  ' }])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result).toEqual({
      reply: 'You have Shop.',
      proposed: [],
      route: null,
      unfinished: false,
    })
    expect(ran).toEqual(['list_projects'])
    expect(toolResults(model)).toContain('Shop')
  })

  it('gathers for the diagram assistant with its own instructions when reading', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([call('list_projects', {}), { text: '- Shop (project 7)' }])

    const result = await runAssistantTools(model, { ...base, purpose: 'reading', tools })

    expect(result.reply).toBe('- Shop (project 7)')
    const system = JSON.stringify(model.doGenerateCalls[0]?.prompt[0])
    expect(system).toContain(NOTHING_TO_READ)
    expect(system).toContain('you cannot change them yourself')
    expect(system).not.toContain('work_on_diagrams')
  })

  it('adds the design-brief steps to the instructions only, the brief staying in the message', async () => {
    const { tools } = fakeTools()
    const brief = 'A shop for 10k users'
    const model = toolCallingModel([{ text: 'How many orders a day?' }])

    await runAssistantTools(model, {
      ...base,
      purpose: 'brief',
      message: brief,
      page: { kind: 'project', id: 7, name: 'Shop' },
      tools,
    })

    const [system, ...prompt] = model.doGenerateCalls[0]?.prompt ?? []
    const instructions = JSON.stringify(system)
    // After the assistant's own instructions, before the reply's language.
    const at = instructions.indexOf(JSON.stringify(DESIGN_BRIEF_INSTRUCTIONS).slice(1, -1))
    expect(at).toBeGreaterThan(instructions.indexOf('work_on_diagrams'))
    expect(at).toBeLessThan(instructions.indexOf('Write the reply in'))
    const sent = JSON.stringify(prompt)
    expect(sent).not.toContain('design brief')
    expect(sent).toContain('kind=\\"project\\" id=\\"7\\"')
    // The brief is the owner's message, last in the prompt like any other.
    expect(sent).toContain(`<message>\\n${brief}\\n</message>`)

    const plain = toolCallingModel([{ text: 'Hello.' }])
    await runAssistantTools(plain, { ...base, tools })
    expect(JSON.stringify(plain.doGenerateCalls[0]?.prompt[0])).not.toContain('design brief')
  })

  it('records a write as a proposal and tells the model it awaits the owner', async () => {
    const { tools, ran } = fakeTools()
    const model = toolCallingModel([
      call('rename_project', { projectId: 7, name: 'Storefront' }),
      { text: 'I proposed the new name.' },
    ])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result.proposed).toEqual([
      { name: 'rename_project', input: { projectId: 7, name: 'Storefront' } },
    ])
    expect(result.reply).toBe('I proposed the new name.')
    expect(ran).toEqual(['record rename_project {"projectId":7,"name":"Storefront"}'])
    expect(toolResults(model)).toContain('approval')
  })

  it('keeps nothing of a write the caller refuses, and tells the model why', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([
      call('rename_project', { projectId: 404, name: 'X' }),
      { text: 'That project does not exist.' },
    ])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result.proposed).toEqual([])
    expect(toolResults(model)).toContain('No project has this id.')
  })

  it('caps the proposals of one message', async () => {
    const { tools } = fakeTools()
    const calls = Array.from({ length: ASSISTANT_PROPOSALS_MAX + 2 }, (_, n) => ({
      tool: 'rename_project',
      input: { projectId: n + 1, name: `P${n}` },
    }))
    const model = toolCallingModel([{ calls }, { text: 'Done.' }])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result.proposed).toHaveLength(ASSISTANT_PROPOSALS_MAX)
    expect(toolResults(model)).toContain('Too many proposals')
  })

  it('ends at a route tool and drops the proposals made before it', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([
      call('rename_project', { projectId: 7, name: 'Storefront' }),
      call('work_on_diagrams', { architectureId: 3 }),
      { text: 'never reached' },
    ])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result).toEqual({
      reply: '',
      proposed: [],
      route: { name: 'work_on_diagrams', input: { architectureId: 3 } },
      unfinished: false,
    })
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('goes on after a route the caller refuses', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([
      call('work_on_diagrams', { architectureId: 404 }),
      { text: 'No such architecture.' },
    ])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result).toEqual({
      reply: 'No such architecture.',
      proposed: [],
      route: null,
      unfinished: false,
    })
    expect(toolResults(model)).toContain('No architecture has this id.')
  })

  it('answers the proposals collected when the time runs out', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([
      call('rename_project', { projectId: 7, name: 'Storefront' }),
      { hang: true },
    ])

    const result = await runAssistantTools(model, { ...base, tools }, { timeoutMs: 100 })

    expect(result).toEqual({
      reply: '',
      proposed: [{ name: 'rename_project', input: { projectId: 7, name: 'Storefront' } }],
      route: null,
      unfinished: false,
    })
  })

  it('fails with timeout when the time runs out with nothing proposed', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ hang: true }])

    const failed = await runAssistantTools(model, { ...base, tools }, { timeoutMs: 50 }).catch(
      (error: unknown) => error,
    )

    expect(failed).toBeInstanceOf(LlmCallError)
    expect((failed as LlmCallError).reason).toBe('timeout')
  })

  it('the last step may only answer, so reads alone never use up the steps', async () => {
    const model = toolCallingModel([call('list_projects', {})])
    const { tools } = fakeTools()
    await runAssistantTools(model, { ...base, tools }, { maxSteps: 3 }).catch(() => null)

    expect(model.doGenerateCalls.map((item) => item.toolChoice?.type)).toEqual([
      'auto',
      'auto',
      'none',
    ])
  })

  it('a step that starts late may only answer, and the loop is unfinished', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([call('list_projects', {}), { text: 'So far: one project.' }])

    const result = await runAssistantTools(model, { ...base, tools }, { answerAfterMs: 0 })

    expect(model.doGenerateCalls.map((item) => item.toolChoice?.type)).toEqual(['auto', 'none'])
    expect(result).toMatchObject({ reply: 'So far: one project.', unfinished: true })
  })

  it('says the loop is unfinished when it used every step, finished otherwise', async () => {
    const { tools } = fakeTools()
    const reading = toolCallingModel([
      call('list_projects', {}),
      call('list_projects', {}),
      { text: 'So far: one project.' },
    ])
    const cut = await runAssistantTools(reading, { ...base, tools }, { maxSteps: 3 })
    expect(cut).toMatchObject({ reply: 'So far: one project.', unfinished: true })

    const quick = toolCallingModel([call('list_projects', {}), { text: 'One project.' }])
    const done = await runAssistantTools(quick, { ...base, tools }, { maxSteps: 3 })
    expect(done.unfinished).toBe(false)
  })

  it('survives an input the schema refuses and records nothing', async () => {
    const { tools, ran } = fakeTools()
    const model = toolCallingModel([
      call('rename_project', { projectId: 'seven', name: '' }),
      { text: 'Sorry.' },
    ])

    const result = await runAssistantTools(model, { ...base, tools })

    expect(result).toEqual({ reply: 'Sorry.', proposed: [], route: null, unfinished: false })
    expect(ran).toEqual([])
  })

  it('cuts a long read result', async () => {
    const tools: AssistantTool[] = [
      {
        name: 'list_projects',
        description: 'Lists the projects.',
        inputSchema: z.object({}),
        kind: AssistantToolKind.Read,
        run: async () => `${'a'.repeat(ASSISTANT_READ_RESULT_MAX_LENGTH * 2)}THE-END`,
      },
    ]
    const model = toolCallingModel([call('list_projects', {}), { text: 'ok' }])

    await runAssistantTools(model, { ...base, tools })

    expect(toolResults(model)).not.toContain('THE-END')
  })

  it('puts the page the owner is on in the prompt', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ text: 'ok' }])

    await runAssistantTools(model, {
      ...base,
      tools,
      page: { kind: 'project', id: 7, name: 'Shop' },
    })

    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(prompt).toContain('project')
    expect(prompt).toContain('Shop')
    expect(model.doGenerateCalls[0]?.tools?.map((tool) => tool.name).sort()).toEqual([
      'list_projects',
      'rename_project',
      'work_on_diagrams',
    ])
  })

  it('names what the owner put in the context, after the page', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ text: 'ok' }])

    await runAssistantTools(model, {
      ...base,
      tools,
      page: { kind: 'project', id: 7, name: 'Shop' },
      context: [
        { kind: 'architecture', id: 3, name: 'Checkout' },
        { kind: 'agent-config', id: 9, name: 'Back "end"' },
      ],
    })

    const user = model.doGenerateCalls[0]?.prompt.find((message) => message.role === 'user')
    const text = (user?.content ?? []).map((part) => (part.type === 'text' ? part.text : '')).at(-1)
    expect(text).toMatch(
      /^<page kind="project" id="7" name="Shop" \/>\n<context>\n<item kind="architecture" id="3" name="Checkout" \/>\n<item kind="agent-config" id="9" name="Back \\"end\\"" \/>\n<\/context>\n/,
    )
  })

  it('names a view of the context with its architecture, then the parts pointed at', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ text: 'ok' }])

    await runAssistantTools(model, {
      ...base,
      tools,
      context: [{ kind: 'view', id: 5, name: 'Classes', architectureId: 3 }],
      pointed: [{ view: 5, type: 'member', label: 'Order.total </pointed>' }],
    })

    const user = model.doGenerateCalls[0]?.prompt.find((message) => message.role === 'user')
    const text = (user?.content ?? []).map((part) => (part.type === 'text' ? part.text : '')).at(-1)
    expect(text).toContain('<item kind="view" id="5" architecture="3" name="Classes" />')
    expect(text).toContain('<part view="5" type="member">Order.total ')
    expect(text?.split('</pointed>')).toHaveLength(2)
  })

  it('puts the files and the history before the page, the most stable first', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ text: 'ok' }])

    await runAssistantTools(model, {
      ...base,
      tools,
      history: [{ role: 'user', text: 'Earlier.' }],
      files: [{ id: 2, name: 'a.md', chars: 9, parts: [{ start: 0, end: 9, summary: '- A' }] }],
      page: { kind: 'project', id: 7, name: 'Shop' },
    })

    const user = model.doGenerateCalls[0]?.prompt.find((message) => message.role === 'user')
    const parts = (user?.content ?? []).map((part) => (part.type === 'text' ? part.text : ''))
    expect(parts[0]).toMatch(/^<files>/)
    expect(parts[1]).toMatch(/^<history>/)
    expect(parts[2]).toMatch(/^<page kind="project"/)
  })

  it('refuses a history that does not fit, without a call', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ text: 'never' }])

    await expect(
      runAssistantTools(
        model,
        { ...base, tools, history: [{ role: 'user', text: 'x'.repeat(200) }] },
        { maxInputTokens: 10 },
      ),
    ).rejects.toBeInstanceOf(AssistantContextFull)
    expect(model.doGenerateCalls).toHaveLength(0)
  })
})

describe('runAssistantTools, streamed', () => {
  const ALLOWED = new Set([
    'start-step',
    'finish-step',
    'text-start',
    'text-delta',
    'text-end',
    'tool-input-start',
  ])

  it('streams steps and tool names, never inputs or results', async () => {
    const chunks: UIMessageChunk[] = []
    const tools: AssistantTool[] = [
      {
        name: 'read_x',
        description: 'Reads x.',
        inputSchema: z.object({ q: z.string() }),
        kind: AssistantToolKind.Read,
        run: async () => ({ secret: 'OUT' }),
      },
    ]
    const result = await runAssistantTools(
      streaming(toolCallingModel([call('read_x', { q: 'IN' }), { text: 'Done' }])),
      { ...base, tools },
      { onChunk: (chunk) => chunks.push(chunk) },
    )
    expect(result.reply).toBe('Done')
    expect(chunks).toContainEqual(
      expect.objectContaining({ type: 'tool-input-start', toolName: 'read_x' }),
    )
    expect(chunks.every((chunk) => ALLOWED.has(chunk.type))).toBe(true)
    expect(JSON.stringify(chunks)).not.toContain('IN')
    expect(JSON.stringify(chunks)).not.toContain('OUT')
    expect(chunks.filter((chunk) => chunk.type === 'start-step')).toHaveLength(2)
  })

  it('stops when the caller aborts', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)
    const error = await runAssistantTools(
      streaming(toolCallingModel([{ hang: true }])),
      { ...base, tools: [] },
      { onChunk: () => {}, abortSignal: controller.signal },
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(LlmCallError)
  })
})

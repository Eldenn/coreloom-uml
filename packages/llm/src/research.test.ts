import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { LlmCallError } from './failure.ts'
import {
  RESEARCH_FINDINGS_MAX_LENGTH,
  RESEARCH_INSTRUCTIONS,
  RESEARCH_TOOL_RESULT_MAX_LENGTH,
  type ResearchPage,
  type ResearchSearchResult,
  type ResearchTools,
  researchInstructions,
  researchWeb,
} from './research.ts'
import { failingModel, type ModelStep, toolCallingModel } from './testing/mock-model.ts'

const read = (url: string): ModelStep => ({ calls: [{ tool: 'read_page', input: { url } }] })

function fakeTools(pages: Record<string, ResearchPage | null> = {}) {
  const calls: string[] = []
  const tools: ResearchTools = {
    async readPage(url) {
      calls.push(`read ${url}`)
      return pages[url] ?? null
    },
    async run(command) {
      calls.push(`run ${command}`)
      return command === 'false' ? { exitCode: 1, output: '' } : { exitCode: 0, output: 'done' }
    },
  }
  return { tools, calls }
}

const page = (text: string, title: string | null = 'A page'): ResearchPage => ({
  title,
  text,
  links: [],
})

/** What the model was shown as the result of its tool calls, as one string. */
function toolResults(model: ReturnType<typeof toolCallingModel>): string {
  return JSON.stringify(
    model.doGenerateCalls.flatMap((call) =>
      call.prompt.filter((message) => message.role === 'tool'),
    ),
  )
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof LlmCallError) return error.reason
    throw error
  }
  throw new Error('The research did not fail')
}

describe('researchWeb', () => {
  it('answers the final text as findings and the pages read as sources', async () => {
    const { tools, calls } = fakeTools({ 'https://a.example/': page('Use pnpm.') })
    const model = toolCallingModel([read('https://a.example/'), { text: 'Use pnpm (a.example).' }])

    const result = await researchWeb(model, { request: 'Read https://a.example/', tools })

    expect(result).toEqual({
      findings: 'Use pnpm (a.example).',
      sources: [{ url: 'https://a.example/', title: 'A page' }],
    })
    expect(calls).toEqual(['read https://a.example/'])
  })

  it('gives the model the request and nothing else of the caller', async () => {
    const { tools } = fakeTools({ 'https://a.example/': page('x') })
    const model = toolCallingModel([read('https://a.example/'), { text: 'x' }])

    await researchWeb(model, { request: 'Conventions of https://a.example/', tools })

    const first = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(first).toContain('Conventions of https://a.example/')
    expect(model.doGenerateCalls[0]?.tools?.map((tool) => tool.name).sort()).toEqual([
      'read_page',
      'run',
    ])
  })

  it('lists a page once and leaves out the pages that could not be read', async () => {
    const { tools } = fakeTools({ 'https://a.example/': page('x', null) })
    const model = toolCallingModel([
      read('https://a.example/'),
      read('https://gone.example/'),
      read('https://a.example/'),
      { text: 'Notes. I also read https://invented.example/.' },
    ])

    const result = await researchWeb(model, { request: 'r', tools })

    expect(result.sources).toEqual([{ url: 'https://a.example/', title: null }])
    expect(toolResults(model)).toContain('could not be read')
  })

  it('cuts a long page before the model sees it', async () => {
    const { tools } = fakeTools({ 'https://a.example/': page(`${'a'.repeat(20_000)}THE-END`) })
    const model = toolCallingModel([read('https://a.example/'), { text: 'x' }])

    await researchWeb(model, { request: 'r', tools })

    const shown = toolResults(model)
    expect(shown).not.toContain('THE-END')
    expect(shown.length).toBeLessThan(RESEARCH_TOOL_RESULT_MAX_LENGTH + 2000)
  })

  it('cuts long findings', async () => {
    const { tools } = fakeTools({ 'https://a.example/': page('x') })
    const model = toolCallingModel([read('https://a.example/'), { text: 'f'.repeat(60_000) }])

    const result = await researchWeb(model, { request: 'r', tools })

    expect(result.findings.length).toBe(RESEARCH_FINDINGS_MAX_LENGTH)
  })

  it('runs a command in the sandbox and counts it as research', async () => {
    const { tools, calls } = fakeTools()
    const model = toolCallingModel([
      { calls: [{ tool: 'run', input: { command: 'git clone https://a.example/r.git' } }] },
      { text: 'The repository says: use pnpm.' },
    ])

    const result = await researchWeb(model, { request: 'r', tools })

    expect(calls).toEqual(['run git clone https://a.example/r.git'])
    expect(result).toEqual({ findings: 'The repository says: use pnpm.', sources: [] })
  })

  it('answers the pages themselves when the steps run out before the model concludes', async () => {
    const { tools } = fakeTools({
      'https://a.example/': page('Use pnpm.'),
      'https://b.example/': page('Never use any.'),
    })
    const model = toolCallingModel([read('https://a.example/'), read('https://b.example/')])

    const result = await researchWeb(model, { request: 'r', tools }, { maxSteps: 2 })

    expect(result.sources.map((source) => source.url)).toEqual([
      'https://a.example/',
      'https://b.example/',
    ])
    expect(result.findings).toContain('https://a.example/')
    expect(result.findings).toContain('Use pnpm.')
    expect(result.findings).toContain('Never use any.')
  })

  it('answers the pages read when the time runs out', async () => {
    const { tools } = fakeTools({ 'https://a.example/': page('Use pnpm.') })
    const model = toolCallingModel([read('https://a.example/'), { hang: true }])

    const result = await researchWeb(model, { request: 'r', tools }, { timeoutMs: 100 })

    expect(result.sources).toHaveLength(1)
    expect(result.findings).toContain('Use pnpm.')
  })

  it('stops waiting for a tool when the time runs out', async () => {
    const signals: (AbortSignal | undefined)[] = []
    const tools: ResearchTools = {
      async readPage(url, signal) {
        signals.push(signal)
        if (url === 'https://a.example/') return page('Use pnpm.')
        // A sandbox that stopped answering, and a tool that ignores its signal.
        await new Promise((resolve) => setTimeout(resolve, 3000))
        return page('Too late.')
      },
      async run() {
        return { exitCode: 0, output: '' }
      },
    }
    const model = toolCallingModel([read('https://a.example/'), read('https://slow.example/')])
    const started = performance.now()

    const result = await researchWeb(model, { request: 'r', tools }, { timeoutMs: 200 })

    expect(performance.now() - started).toBeLessThan(1500)
    expect(result.sources.map((source) => source.url)).toEqual(['https://a.example/'])
    expect(result.findings).toContain('Use pnpm.')
    expect(signals[0]).toBeInstanceOf(AbortSignal)
  })

  it('fails with timeout when the time runs out before anything was read', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([{ hang: true }])

    expect(await reasonOf(researchWeb(model, { request: 'r', tools }, { timeoutMs: 50 }))).toBe(
      'timeout',
    )
  })

  it('fails with tools_unused when the model answers without reading anything', async () => {
    const { tools, calls } = fakeTools()
    const model = toolCallingModel([{ text: 'Best practices are: test your code.' }])

    expect(await reasonOf(researchWeb(model, { request: 'no url here', tools }))).toBe(
      'tools_unused',
    )
    expect(calls).toEqual([])
  })

  it('fails with tools_unused when nothing it tried worked', async () => {
    const { tools } = fakeTools()
    const model = toolCallingModel([
      read('https://gone.example/'),
      { calls: [{ tool: 'run', input: { command: 'false' } }] },
      { text: 'From memory: test your code.' },
    ])

    expect(await reasonOf(researchWeb(model, { request: 'r', tools }))).toBe('tools_unused')
  })

  it('fails with tools_unused when the pages read hold no text and the model says nothing', async () => {
    const { tools } = fakeTools({ 'https://a.example/': page('') })
    const model = toolCallingModel([read('https://a.example/'), { text: '  ' }])

    expect(await reasonOf(researchWeb(model, { request: 'r', tools }))).toBe('tools_unused')
  })

  it('reduces a provider error to its reason', async () => {
    const { tools } = fakeTools()
    const error = new APICallError({
      message: 'no',
      url: 'https://api.example/',
      requestBodyValues: {},
      statusCode: 401,
    })

    expect(await reasonOf(researchWeb(failingModel(error), { request: 'r', tools }))).toBe(
      'unauthorized',
    )
  })

  describe('with a search engine', () => {
    const search = (query: string): ModelStep => ({
      calls: [{ tool: 'search_web', input: { query } }],
    })
    const found: ResearchSearchResult = {
      title: 'Style guide',
      url: 'https://a.example/',
      snippet: 'Use pnpm.',
      publishedAt: null,
    }

    function searchingTools(pages: Record<string, ResearchPage | null> = {}) {
      const { tools, calls } = fakeTools(pages)
      const searchingOnes: ResearchTools = {
        ...tools,
        async search(query) {
          calls.push(`search ${query}`)
          return query === 'broken' ? null : query === 'nothing' ? [] : [found]
        },
      }
      return { tools: searchingOnes, calls }
    }

    const instructionsOf = (model: ReturnType<typeof toolCallingModel>) =>
      JSON.stringify(model.doGenerateCalls[0]?.prompt.filter((m) => m.role === 'system'))

    it('offers no search_web and keeps the instructions without one', async () => {
      const { tools } = fakeTools({ 'https://a.example/': page('x') })
      const model = toolCallingModel([read('https://a.example/'), { text: 'x' }])

      await researchWeb(model, { request: 'r', tools })

      expect(model.doGenerateCalls[0]?.tools?.map((tool) => tool.name)).not.toContain('search_web')
      expect(RESEARCH_INSTRUCTIONS).toBe(researchInstructions(false))
      expect(RESEARCH_INSTRUCTIONS).toContain('You have no search engine.')
      expect(instructionsOf(model)).toContain('You have no search engine.')
    })

    it('searches, then answers the page read alone as a source', async () => {
      const { tools, calls } = searchingTools({ 'https://a.example/': page('Use pnpm.') })
      const model = toolCallingModel([
        search('pnpm conventions'),
        read('https://a.example/'),
        { text: 'Use pnpm (https://a.example/).' },
      ])

      const result = await researchWeb(model, { request: 'r', tools })

      expect(calls).toEqual(['search pnpm conventions', 'read https://a.example/'])
      expect(result.sources).toEqual([{ url: 'https://a.example/', title: 'A page' }])
      expect(model.doGenerateCalls[0]?.tools?.map((tool) => tool.name).sort()).toEqual([
        'read_page',
        'run',
        'search_web',
      ])
      const shown = toolResults(model)
      expect(shown).toContain('Style guide')
      expect(shown).toContain('Use pnpm.')
      expect(instructionsOf(model)).toContain('Use search_web to find pages')
      expect(instructionsOf(model)).not.toContain('You have no search engine.')
    })

    it('tells the model when a search failed or found nothing', async () => {
      const { tools } = searchingTools({ 'https://a.example/': page('x') })
      const model = toolCallingModel([
        search('broken'),
        search('nothing'),
        read('https://a.example/'),
        { text: 'x' },
      ])

      await researchWeb(model, { request: 'r', tools })

      expect(toolResults(model)).toContain('The search failed.')
      expect(toolResults(model)).toContain('No result.')
    })

    it('fails with tools_unused when the model only searched', async () => {
      const { tools } = searchingTools()
      const model = toolCallingModel([search('pnpm'), { text: 'Snippets say: use pnpm.' }])

      expect(await reasonOf(researchWeb(model, { request: 'r', tools }))).toBe('tools_unused')
    })

    it('refuses a query of spaces', async () => {
      const { tools, calls } = searchingTools({ 'https://a.example/': page('x') })
      const model = toolCallingModel([search('   '), read('https://a.example/'), { text: 'x' }])

      await researchWeb(model, { request: 'r', tools })

      expect(calls).toEqual(['read https://a.example/'])
      expect(toolResults(model)).toContain('InvalidToolInputError')
    })
  })
})

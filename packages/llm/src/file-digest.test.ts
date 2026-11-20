import { describe, expect, it } from 'vitest'
import { LlmCallError } from './failure.ts'
import {
  FILE_DIGEST_MAX_LENGTH,
  FILE_SUMMARY_MAX_LENGTH,
  splitText,
  summarizeFile,
} from './file-digest.ts'
import { answeringModel, failingModel, MockLanguageModelV4 } from './testing/mock-model.ts'

const USAGE = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
}

describe('splitText', () => {
  it('loses nothing and keeps every part within the size', () => {
    const text = Array.from({ length: 500 }, (_, line) => `line ${String(line)}`).join('\n')
    const parts = splitText(text, 300)
    expect(parts.join('')).toBe(text)
    expect(parts.every((part) => part.length <= 300)).toBe(true)
    expect(parts.slice(0, -1).every((part) => part.endsWith('\n'))).toBe(true)
  })

  it('cuts a text without line breaks at the size', () => {
    expect(splitText('x'.repeat(250), 100).map((part) => part.length)).toEqual([100, 100, 50])
  })
})

describe('summarizeFile', () => {
  it('summarizes every part with its offsets; a part of nothing is empty', async () => {
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: calls++ === 1 ? 'Nothing.' : '- Uses pnpm' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: USAGE,
        warnings: [],
      }),
    })
    const summary = await summarizeFile(
      model,
      { name: 'book.pdf', content: 'x'.repeat(250) },
      { partLength: 100, concurrency: 1 },
    )

    expect(summary.failed).toBe(0)
    expect(summary.parts).toEqual([
      { start: 0, end: 100, summary: '- Uses pnpm' },
      { start: 100, end: 200, summary: '' },
      { start: 200, end: 250, summary: '- Uses pnpm' },
    ])
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('of=\\"3\\"')
  })

  it('counts the parts that failed: their summary is null', async () => {
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (calls++ === 0) throw new Error('boom')
        return {
          content: [{ type: 'text', text: '- Kept' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: USAGE,
          warnings: [],
        }
      },
    })
    const summary = await summarizeFile(
      model,
      { name: 'a.md', content: 'x'.repeat(200) },
      { partLength: 100, concurrency: 1 },
    )

    expect(summary.failed).toBe(1)
    expect(summary.parts.map((part) => part.summary)).toEqual([null, '- Kept'])
  })

  it('throws when no part could be read', async () => {
    await expect(
      summarizeFile(failingModel(new Error('boom')), { name: 'a.md', content: 'text' }),
    ).rejects.toBeInstanceOf(LlmCallError)
  })

  it('keeps all the summaries within their room, even when every answer is long', async () => {
    const summary = await summarizeFile(answeringModel(`- ${'y'.repeat(20_000)}`), {
      name: 'long.txt',
      content: 'x'.repeat(FILE_DIGEST_MAX_LENGTH),
    })

    expect(summary.parts).toHaveLength(12)
    const total = summary.parts.reduce((sum, part) => sum + (part.summary?.length ?? 0), 0)
    expect(total).toBeLessThanOrEqual(FILE_SUMMARY_MAX_LENGTH)
  })
})

import { describe, expect, it } from 'vitest'
import { ASSISTANT_FILE_MAX_LENGTH } from './assistant.ts'
import { LlmCallError } from './failure.ts'
import { digestFile, FILE_DIGEST_MAX_LENGTH, splitText } from './file-digest.ts'
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

describe('digestFile', () => {
  it('notes every part, leaves out the empty ones and names the file', async () => {
    let calls = 0
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: calls++ === 1 ? 'Nothing.' : '- Uses pnpm' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: USAGE,
        warnings: [],
      }),
    })
    const digest = await digestFile(
      model,
      { name: 'book.pdf', content: 'x'.repeat(250) },
      { partLength: 100, concurrency: 1 },
    )

    expect(digest.parts).toBe(3)
    expect(digest.failed).toBe(0)
    expect(digest.file.name).toBe('book.pdf')
    expect(digest.file.content).toContain('3 parts')
    expect(digest.file.content).toContain('## Part 1\n- Uses pnpm')
    expect(digest.file.content).not.toContain('## Part 2')
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('of=\\"3\\"')
  })

  it('counts the parts that failed and keeps the others', async () => {
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
    const digest = await digestFile(
      model,
      { name: 'a.md', content: 'x'.repeat(200) },
      { partLength: 100, concurrency: 1 },
    )

    expect(digest.failed).toBe(1)
    expect(digest.file.content).toContain('1 of which could not be read')
    expect(digest.file.content).toContain('## Part 2\n- Kept')
  })

  it('throws when no part could be read', async () => {
    await expect(
      digestFile(failingModel(new Error('boom')), { name: 'a.md', content: 'text' }),
    ).rejects.toBeInstanceOf(LlmCallError)
  })

  it('always fits a message, even when every note is as long as it may be', async () => {
    const digest = await digestFile(answeringModel(`- ${'y'.repeat(20_000)}`), {
      name: 'long.txt',
      content: 'x'.repeat(FILE_DIGEST_MAX_LENGTH),
    })

    expect(digest.parts).toBe(12)
    expect(digest.file.content.length).toBeLessThanOrEqual(ASSISTANT_FILE_MAX_LENGTH)
  })
})

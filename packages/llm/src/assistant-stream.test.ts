import { describe, expect, it } from 'vitest'
import { assistantEventStream } from './assistant-stream.ts'

async function text(stream: ReadableStream<string>): Promise<string> {
  let all = ''
  for await (const chunk of stream) all += chunk
  return all
}

function events(body: string): unknown[] {
  return body
    .split('\n\n')
    .map((frame) => frame.replace(/^data: /, ''))
    .filter((data) => data !== '' && data !== '[DONE]')
    .map((data) => JSON.parse(data))
}

describe('assistantEventStream', () => {
  it('frames chunks, then data-chat', async () => {
    const body = await text(
      assistantEventStream(async (writer) => {
        writer.chunk({ type: 'text-start', id: '1' })
        writer.done({ ok: 1 })
      }),
    )
    expect(events(body)).toContainEqual({ type: 'text-start', id: '1' })
    expect(events(body)).toContainEqual({ type: 'data-chat', data: { ok: 1 } })
    expect(body.trimEnd().endsWith('data: [DONE]')).toBe(true)
  })

  it('frames a failure as status and body', async () => {
    const body = await text(
      assistantEventStream(async (writer) => writer.fail(502, { reason: 'rate_limited' })),
    )
    const error = events(body).find(
      (event): event is { type: 'error'; errorText: string } =>
        (event as { type: string }).type === 'error',
    )
    expect(JSON.parse(error?.errorText ?? '')).toEqual({
      status: 502,
      body: { reason: 'rate_limited' },
    })
  })

  it('never answers a thrown error with its message', async () => {
    const body = await text(
      assistantEventStream(async () => {
        throw new Error('sk-secret')
      }),
    )
    expect(body).not.toContain('sk-secret')
    expect(events(body)).toContainEqual({ type: 'error', errorText: 'failed' })
  })
})

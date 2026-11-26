import { TuyauError } from '@tuyau/core/client'
import type { UIMessage } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { chatFailure, createAssistantChat, draftOf, sendChat, stopChat } from '@/lib/assistant-chat'

const URL = 'http://api.test/assistant/conversations/7/messages'

/** A UI message stream body, as the API sends it. */
function streamOf(chunks: unknown[]): Response {
  const body = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), 'data: [DONE]\n\n']
  return new Response(body.join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  })
}

function stubFetch(response: () => Response) {
  const calls: { url: string; body: unknown; headers: Headers }[] = []
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    const body = typeof init.body === 'string' ? init.body : 'null'
    calls.push({ url, body: JSON.parse(body), headers: new Headers(init.headers) })
    return Promise.resolve(response())
  })
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendChat', () => {
  it('sends the body and the text only, and answers the stored exchange', async () => {
    const calls = stubFetch(() =>
      streamOf([
        { type: 'start' },
        { type: 'start-step' },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'Hello' },
        { type: 'text-end', id: '1' },
        { type: 'finish-step' },
        { type: 'data-chat', data: { messages: [1, 2], handoff: null, unfinished: false } },
        { type: 'finish' },
      ]),
    )
    const chat = createAssistantChat<{ messages: number[] }>(URL)

    const output = await sendChat(chat, 'hi', {
      locale: 'en',
      provider: { kind: 'anthropic', model: 'm' },
    })

    expect(output).toEqual({ messages: [1, 2], handoff: null, unfinished: false })
    expect(calls[0]?.url).toBe(URL)
    expect(calls[0]?.body).toEqual({
      locale: 'en',
      provider: { kind: 'anthropic', model: 'm' },
      message: 'hi',
    })
    expect(calls[0]?.headers.get('accept')).toBe('text/event-stream')
    expect(chat.messages).toEqual([])
  })

  it('throws a refusal before the stream as Tuyau does', async () => {
    stubFetch(() => Response.json({ error: { message: 'full' } }, { status: 422 }))
    const error = await sendChat(createAssistantChat(URL), 'hi', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TuyauError)
    expect((error as TuyauError).status).toBe(422)
    expect((error as TuyauError).response).toEqual({ error: { message: 'full' } })
  })

  it('throws the error chunk a stream ends with', async () => {
    stubFetch(() =>
      streamOf([
        { type: 'start' },
        {
          type: 'error',
          errorText: JSON.stringify({ status: 502, body: { reason: 'rate_limited' } }),
        },
      ]),
    )
    const error = await sendChat(createAssistantChat(URL), 'hi', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TuyauError)
    expect((error as TuyauError).status).toBe(502)
    expect((error as TuyauError).response).toEqual({ reason: 'rate_limited' })
  })
})

describe('sendChat, cut short or stopped', () => {
  const partial = () =>
    streamOf([
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'Hel' },
    ])

  it('fails a stream that ends before its answer', async () => {
    stubFetch(partial)
    const error = await sendChat(createAssistantChat(URL), 'hi', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TuyauError)
    expect((error as TuyauError).kind).toBe('network')
  })

  it('answers null once the owner stopped it', async () => {
    let started = false
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"start"}\n\n'))
          started = true
          init.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('', 'AbortError')),
          )
        },
      })
      return Promise.resolve(
        new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
      )
    })
    const chat = createAssistantChat(URL)
    const sent = sendChat(chat, 'hi', {})
    await vi.waitFor(() => expect(started).toBe(true))
    await stopChat(chat)
    expect(await sent).toBeNull()
  })
})

describe('chatFailure', () => {
  it('keeps a network failure a network failure', () => {
    expect(chatFailure(new Error('Failed to fetch')).kind).toBe('network')
  })
})

describe('draftOf', () => {
  const reply = (parts: UIMessage['parts']): UIMessage[] => [
    { id: 'u', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    { id: 'a', role: 'assistant', parts },
  ]
  const tool = {
    type: 'tool-read_x',
    toolCallId: 'c',
    state: 'input-streaming',
    input: undefined,
  } as const

  it('keeps the text after the last step', () => {
    expect(
      draftOf(
        reply([
          { type: 'step-start' },
          { type: 'text', text: 'Let me look' },
          tool,
          { type: 'step-start' },
          { type: 'text', text: 'Done' },
        ]),
      ),
    ).toEqual({ text: 'Done', reading: false, activity: [] })
  })

  it('says a tool is running', () => {
    expect(
      draftOf(reply([{ type: 'step-start' }, { type: 'text', text: 'Let me look' }, tool])),
    ).toEqual({ text: 'Let me look', reading: true, activity: [] })
  })

  it('lists the tool calls of the whole reply, as the API tells them', () => {
    const ran = { id: 'tool-1', tool: 'run_repository_command', status: 'done', detail: 'ls' }
    const draft = draftOf(
      reply([
        { type: 'step-start' },
        { type: 'data-activity', id: 'tool-1', data: ran },
        { type: 'step-start' },
        { type: 'text', text: 'Done' },
      ]),
    )
    expect(draft?.activity).toEqual([ran])
  })

  it('has no draft before the reply starts', () => {
    expect(draftOf(reply([]).slice(0, 1))).toBeNull()
  })
})

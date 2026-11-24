// The workspace assistant's chat, streamed through the AI SDK's `useChat` (a `Chat` per
// conversation). The API answers its UI message stream: the reply's text as it is written, the
// tools the « Auto » loop calls (`data-activity` parts: a name, and for a repository tool what it
// asks of the sandbox and what a command prints), then one `data-chat` part holding the stored
// exchange. The stored messages stay the conversation's: the screen reads them from the query
// hooks, and the `Chat` only holds the message being written. Pure, so it runs in Node tests.
import { Chat } from '@ai-sdk/react'
import { TuyauError } from '@tuyau/core/client'
import { DefaultChatTransport, type UIMessage } from 'ai'

/** What the API's `data-chat` part holds: `ChatOutput`, as the JSON route answers it. */
export type AssistantChatMessage<Output = unknown> = UIMessage<
  never,
  { chat: Output; activity: ToolActivity }
>

/** One tool call as the API tells it while it runs (the same `id` replaces the one before). */
export interface ToolActivity {
  id: string
  tool: string
  status: 'running' | 'done'
  /** What a repository tool asks of the sandbox: a path, a query, a command. */
  detail?: string
  /** What a command printed so far. */
  output?: string
  exitCode?: number
}

/** A failed call as Tuyau builds one, so `providerCallFailure` and `getErrorMessage` read it. */
export function httpError(status: number, body: unknown): TuyauError {
  return Object.assign(new TuyauError(`Request failed with status ${String(status)}`), {
    kind: 'http' as const,
    status,
    response: body,
  })
}

/**
 * A failure the `Chat` reports, as a `TuyauError`: our transport's own (an answer before the
 * stream), or the `error` chunk the API ends a stream with (`{ status, body }` as JSON).
 */
export function chatFailure(error: Error): TuyauError {
  if (error instanceof TuyauError) return error as TuyauError
  try {
    const { status, body } = JSON.parse(error.message) as { status?: unknown; body?: unknown }
    if (typeof status === 'number') return httpError(status, body)
  } catch {
    // Not ours: a network failure, a stream cut short.
  }
  return Object.assign(new TuyauError(error.message), { kind: 'network' as const })
}

/** Reads a refusal before the stream (404, 422, 502) the way the Tuyau client does. */
export async function answerOrThrow(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init)
  if (response.ok) return response
  const body: unknown = await response.json().catch(() => null)
  throw httpError(response.status, body)
}

const lastText = (message: UIMessage | undefined) =>
  (message?.parts ?? []).flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')

/**
 * One conversation's chat (`POST /assistant/conversations/:id/messages`, streamed). A request
 * carries the body `send` gives and the text of the message, never the list of messages: the
 * API reads the conversation's history itself.
 */
export function createAssistantChat<Output>(url: string): Chat<AssistantChatMessage<Output>> {
  return new Chat<AssistantChatMessage<Output>>({
    transport: new DefaultChatTransport({
      api: url,
      credentials: 'include',
      headers: { Accept: 'text/event-stream' },
      fetch: answerOrThrow,
      prepareSendMessagesRequest: ({ messages, body }) => ({
        body: { ...body, message: lastText(messages.at(-1)) },
      }),
    }),
  })
}

/** The chats the owner stopped since their last message: a stream they end is no failure. */
const stopped = new WeakSet<Chat<UIMessage>>()

/** Stop: cancels the reply being written (the API then stores nothing). */
export function stopChat<Output>(chat: Chat<AssistantChatMessage<Output>>): Promise<void> {
  stopped.add(chat as unknown as Chat<UIMessage>)
  return chat.stop()
}

/**
 * Sends one message and waits for the stream to end: the stored exchange, `null` when the owner
 * stopped it (`stopChat`; nothing is stored then), or the failure as a `TuyauError`. The `Chat` is emptied
 * afterwards either way: what was stored comes back through the conversation's query.
 */
export async function sendChat<Output>(
  chat: Chat<AssistantChatMessage<Output>>,
  text: string,
  body: Record<string, unknown>,
): Promise<Output | null> {
  const key = chat as unknown as Chat<UIMessage>
  stopped.delete(key)
  chat.messages = []
  try {
    await chat.sendMessage({ text }, { body })
    if (chat.status === 'error' && chat.error) throw chatFailure(chat.error)
    const done = chat.lastMessage?.parts.find((part) => part.type === 'data-chat')
    if (done) return done.data
    // Stopped by the owner: the API stored nothing. Otherwise the stream was cut short.
    if (stopped.has(key)) return null
    throw chatFailure(new Error('The stream ended before its answer'))
  } finally {
    chat.messages = []
  }
}

/**
 * The reply being written: its text since the last step, whether a tool is running, and every
 * tool call of the reply so far.
 */
export interface ChatDraft {
  text: string
  reading: boolean
  activity: ToolActivity[]
}

export function draftOf(messages: readonly UIMessage[]): ChatDraft | null {
  const last = messages.at(-1)
  if (last?.role !== 'assistant') return null
  const start = last.parts.findLastIndex((part) => part.type === 'step-start')
  const step = last.parts.slice(start + 1)
  const text = step.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('')
  const reading = step.at(-1)?.type.startsWith('tool-') === true
  const activity = last.parts.flatMap((part) =>
    part.type === 'data-activity' ? [part.data as ToolActivity] : [],
  )
  return { text, reading, activity }
}

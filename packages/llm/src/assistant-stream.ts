import {
  createUIMessageStream,
  generateText,
  JsonToSseTransformStream,
  streamText,
  type UIMessageChunk,
} from 'ai'

export { UI_MESSAGE_STREAM_HEADERS, type UIMessageChunk } from 'ai'

/**
 * How a caller follows a reply as it is written. Only the chunks of `ALLOWED` ever reach
 * `onChunk`: the text, where each step starts and ends, and which tool is called (its name, never
 * its input or result: those may hold the owner's source code or account data).
 */
export type AssistantStreamOptions = {
  onChunk?: (chunk: UIMessageChunk) => void
  abortSignal?: AbortSignal
}

type CallSettings = Parameters<typeof generateText>[0]

/**
 * One call to the model: `generateText` without `onChunk`, `streamText` with it. Same text, same
 * steps and same errors either way, so callers keep one path.
 */
export async function completeText(
  settings: CallSettings,
  stream: AssistantStreamOptions,
): Promise<{ text: string; stepCount: number }> {
  const { onChunk, abortSignal } = stream
  if (!onChunk) {
    const result = await generateText({ ...settings, abortSignal })
    return { text: result.text, stepCount: result.steps.length }
  }
  // Its default prints the error, which may carry a request with the owner's key in it.
  const result = streamText({ ...settings, abortSignal, onError: () => {} } as Parameters<
    typeof streamText
  >[0])
  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'start-step':
      case 'finish-step':
        onChunk({ type: part.type })
        break
      case 'text-start':
      case 'text-end':
        onChunk({ type: part.type, id: part.id })
        break
      case 'text-delta':
        onChunk({ type: 'text-delta', id: part.id, delta: part.text })
        break
      // The call once complete, whichever way the provider streams it: the name only.
      case 'tool-call':
        onChunk({ type: 'tool-input-start', toolCallId: part.toolCallId, toolName: part.toolName })
        break
      case 'error':
        throw part.error
      case 'abort':
        throw new DOMException('The call was aborted', 'AbortError')
      default:
        // Anything else (inputs, results, reasoning, sources) stays on the server.
        break
    }
  }
  return { text: await result.text, stepCount: (await result.steps).length }
}

/** Writes the end of a chat stream: the stored exchange, or the failure the JSON route answers. */
export type AssistantStreamWriter = {
  chunk(chunk: UIMessageChunk): void
  done(output: unknown): void
  fail(status: number, body: unknown): void
}

/**
 * The body of a streamed answer, in the AI SDK's UI message stream protocol (Server-Sent Events,
 * sent with `UI_MESSAGE_STREAM_HEADERS`): what `execute` writes, then `data-chat` (`done`) or one
 * `error` whose text is `{ status, body }` as JSON (`fail`). A throw from `execute` ends it with a
 * bare `error`, never the error's own message.
 */
export function assistantEventStream(
  execute: (writer: AssistantStreamWriter) => Promise<void>,
): ReadableStream<string> {
  return createUIMessageStream({
    execute: ({ writer }) =>
      execute({
        chunk: (chunk) => writer.write(chunk),
        done: (output) => writer.write({ type: 'data-chat', data: output }),
        fail: (status, body) =>
          writer.write({ type: 'error', errorText: JSON.stringify({ status, body }) }),
      }),
    onError: () => 'failed',
  }).pipeThrough(new JsonToSseTransformStream())
}

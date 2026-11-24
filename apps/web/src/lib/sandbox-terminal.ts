// One command of the owner's terminal in a conversation's repository sandbox
// (`POST /assistant/conversations/:id/sandbox/commands`), read as the event stream the API
// answers: what the command prints as it prints it, then its exit code and the folder it ended
// in. A stream Tuyau cannot read, so this is a plain `fetch`; nothing of it is cached or kept.
// Pure, so it runs in Node tests.
import { answerOrThrow, httpError } from '@/lib/assistant-chat'

/** How a command ended: its exit code, and the folder the next one starts in. */
export interface SandboxCommandEnd {
  exitCode: number
  cwd: string | null
}

type Frame = { output: string } | { error: unknown } | SandboxCommandEnd

/** The `data:` frames of an event stream, parsed; comments (the API's "still alive") are skipped. */
export async function* eventFrames(body: ReadableStream<Uint8Array>): AsyncGenerator {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    const frames = (buffer + decoder.decode(value, { stream: true })).split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      if (frame.startsWith('data: ')) yield JSON.parse(frame.slice(6))
    }
  }
}

/**
 * Runs `command` and hands `write` each piece of its output as it comes. Aborting `signal`
 * (Ctrl+C) closes the stream, and the API then stops the command in the sandbox. A refusal
 * (no sandbox, the assistant using it) is thrown as the Tuyau client would.
 */
export async function runSandboxCommand(
  url: string,
  command: string,
  { signal, write }: { signal: AbortSignal; write: (text: string) => void },
): Promise<SandboxCommandEnd> {
  const response = await answerOrThrow(url, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
    signal,
  })
  if (response.body) {
    for await (const frame of eventFrames(response.body) as AsyncGenerator<Frame>) {
      if ('output' in frame) write(frame.output)
      // The sandbox stopped answering once the stream had begun.
      else if ('error' in frame) throw httpError(503, frame)
      else return frame
    }
  }
  throw new Error('The stream ended before its answer')
}

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runSandboxCommand } from '@/lib/sandbox-terminal'

const URL = 'http://api.test/assistant/conversations/7/sandbox/commands'

/** A body sent in pieces that cut frames (and a character) anywhere. */
function streamOf(text: string, size: number): Response {
  const bytes = new TextEncoder().encode(text)
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += size) controller.enqueue(bytes.slice(at, at + size))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`

function run(response: Response) {
  const calls: RequestInit[] = []
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    calls.push(init)
    return Promise.resolve(response)
  })
  const written: string[] = []
  const ended = runSandboxCommand(URL, 'ls', {
    signal: new AbortController().signal,
    write: (text) => written.push(text),
  })
  return { calls, written, ended }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runSandboxCommand', () => {
  it('writes the output as it comes, then answers how the command ended', async () => {
    const body = `${frame({ output: 'é€1\n' })}: alive\n\n${frame({ output: 'two' })}${frame({ exitCode: 3, cwd: '/home/user/repo/src' })}`
    const { calls, written, ended } = run(streamOf(body, 5))
    expect(await ended).toEqual({ exitCode: 3, cwd: '/home/user/repo/src' })
    expect(written).toEqual(['é€1\n', 'two'])
    expect(calls[0]?.body).toBe('{"command":"ls"}')
    expect(new Headers(calls[0]?.headers).get('accept')).toBe('text/event-stream')
  })

  it('throws a refusal, a sandbox that stopped answering and a stream cut short', async () => {
    const busy = { error: { message: 'The assistant is using the sandbox.', code: 'busy' } }
    const refused = run(new Response(JSON.stringify(busy), { status: 409 }))
    await expect(refused.ended).rejects.toMatchObject({ status: 409, response: busy })
    const gone = { error: { message: 'Unavailable.', code: 'unavailable' } }
    const stopped = run(streamOf(frame({ output: 'a' }) + frame(gone), 7))
    await expect(stopped.ended).rejects.toMatchObject({ status: 503, response: gone })
    expect(stopped.written).toEqual(['a'])
    await expect(run(streamOf(frame({ output: 'a' }), 7)).ended).rejects.toThrow('stream ended')
  })
})

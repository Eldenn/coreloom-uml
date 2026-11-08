import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testConnection } from './connection.ts'
import { createLanguageModel } from './provider.ts'

/**
 * A fake OpenAI-compatible server: the model name picks the answer, so each test drives the
 * real provider client (and its error handling) without calling anyone.
 */
let server: Server
let baseUrl: string
const seen: { authorization?: string; body: string }[] = []

function chatCompletion(res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 0,
      model: 'ok',
      choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    }),
  )
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  let body = ''
  for await (const chunk of req) body += chunk
  seen.push({ authorization: req.headers.authorization, body })
  const model = (JSON.parse(body) as { model: string }).model
  const status = { unauthorized: 401, missing: 404, limited: 429, broken: 500 }[model]
  if (status) {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'nope' } }))
  } else if (model === 'redirect') {
    res.writeHead(307, { location: 'http://169.254.169.254/latest' })
    res.end()
  } else if (model === 'slow') {
    setTimeout(() => chatCompletion(res), 2000)
  } else {
    chatCompletion(res)
  }
}

beforeAll(async () => {
  server = createServer((req, res) => void handle(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

function model(name: string, apiKey = 'test-key') {
  return createLanguageModel({ kind: 'openai-compatible', model: name, baseUrl }, apiKey)
}

describe('testConnection', () => {
  it('answers ok with the latency, with one short call', async () => {
    const result = await testConnection(model('ok'))
    expect(result).toEqual({ ok: true, latencyMs: expect.any(Number) })
    const last = seen.at(-1)
    expect(last?.authorization).toBe('Bearer test-key')
    expect(JSON.parse(last?.body ?? '{}')).toMatchObject({
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    })
  })

  it('maps provider errors to reasons', async () => {
    expect(await testConnection(model('unauthorized'))).toEqual({
      ok: false,
      reason: 'unauthorized',
    })
    expect(await testConnection(model('missing'))).toEqual({ ok: false, reason: 'model_not_found' })
    expect(await testConnection(model('limited'))).toEqual({ ok: false, reason: 'rate_limited' })
    expect(await testConnection(model('broken'))).toEqual({ ok: false, reason: 'unknown' })
  })

  it('never follows a redirect', async () => {
    expect(await testConnection(model('redirect'))).toEqual({ ok: false, reason: 'unreachable' })
  })

  it('reports a server that does not answer in time', async () => {
    expect(await testConnection(model('slow'), { timeoutMs: 200 })).toEqual({
      ok: false,
      reason: 'timeout',
    })
  })

  it('reports a server that cannot be reached', async () => {
    const closed = createLanguageModel(
      { kind: 'ollama', model: 'qwen3', baseUrl: 'http://127.0.0.1:1' },
      '',
    )
    expect(await testConnection(closed)).toEqual({ ok: false, reason: 'unreachable' })
  })

  it('sends no Authorization header when a server takes no key', async () => {
    await testConnection(model('ok', ''))
    expect(seen.at(-1)?.authorization).toBeUndefined()
  })
})

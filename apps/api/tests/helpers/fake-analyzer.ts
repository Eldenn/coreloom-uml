import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { gzipSync } from 'node:zlib'
import app from '@adonisjs/core/services/app'

/* A stand-in for the analyzer service (`apps/analyzer`), answering what it answers. */

/** The commit the fake analyzer reports. */
export const ANALYZED_SHA = '0123456789abcdef0123456789abcdef01234567'

/** graphify's own output on part of this repository (see `packages/codemap/fixtures`). */
const GRAPH = readFileSync(app.makePath('../../packages/codemap/fixtures/adonis-graph.json'))

export type Answer = { status: number; body: Buffer | object; headers?: Record<string, string> }

/** Records each request, answers the next queued answer (a 500 when none is left). */
export class FakeAnalyzer {
  requests: Array<Record<string, unknown>> = []
  answers: Answer[] = []
  #server: Server

  constructor() {
    this.#server = createServer((request, response) => void this.#handle(request, response))
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.#server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${String((this.#server.address() as AddressInfo).port)}`
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.#server.close(() => resolve()))
  }

  async #handle(request: IncomingMessage, response: ServerResponse) {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    this.requests.push(
      JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
    )
    const answer: Answer = this.answers.shift() ?? {
      status: 500,
      body: { error: { code: 'internal' } },
    }
    const isBytes = Buffer.isBuffer(answer.body)
    response.writeHead(answer.status, {
      'content-type': isBytes ? 'application/gzip' : 'application/json',
      ...answer.headers,
    })
    response.end(isBytes ? answer.body : JSON.stringify(answer.body))
  }
}

/** The analyzer's answer for a repository it read: the fixture graph, gzipped. */
export function graphAnswer(commit = ANALYZED_SHA): Answer {
  return {
    status: 200,
    body: gzipSync(GRAPH),
    headers: { 'x-commit-sha': commit, 'x-branch': 'main', 'x-graphify-version': '0.9.108' },
  }
}

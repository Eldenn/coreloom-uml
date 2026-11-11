import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashManagedBlock, wrapManagedBlock } from '@coreloom-uml/catalog'
import type { Generation } from '../src/api.ts'
import type { Io } from '../src/io.ts'

export const API_KEY = 'clu_fixture-key'

export function file(path: string, body: string) {
  const block = wrapManagedBlock(body)
  return {
    path,
    kind: 'generic' as const,
    content: `${block}\n`,
    blockHash: hashManagedBlock(block),
  }
}

/** A settings file: a JSON object, or a TOML block already in its `#` markers. */
export function settingsFile(path: string, content: string) {
  return {
    path,
    kind: 'settings' as const,
    content: `${content}\n`,
    blockHash: hashManagedBlock(content),
  }
}

export function generation(id: number, files: Generation['files']): Generation {
  return {
    id,
    revision: id,
    catalogVersion: '0.2.0',
    files,
    recommendations: [{ target: 'generic', title: 'Nested rules', body: 'Use nested AGENTS.md.' }],
    skills: {
      compatible: [
        { name: 'tidy-tests', url: 'https://example.com/tidy-tests' },
        { name: 'not-a-link', url: 'javascript:alert(1)' },
      ],
      conflicting: [{ name: 'loose-tests', url: 'https://example.com/loose-tests' }],
    },
  }
}

/**
 * A fake API serving the latest generation of configuration 3, which sits in project 7: by its id
 * (`/agent-configs/3/…`) or by its project (`/projects/7/agent-config/…`).
 */
export class FixtureApi {
  current: Generation | null = null
  /** Answer every request with this status instead (401, 403, 302…). */
  status: number | null = null
  readonly requests: { url: string; authorization: string | undefined }[] = []
  private server: Server | null = null
  url = ''

  async start() {
    this.server = createServer((request, response) => {
      this.requests.push({ url: request.url ?? '', authorization: request.headers.authorization })
      const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        response.writeHead(status, { 'content-type': 'application/json', ...headers })
        response.end(JSON.stringify(body))
      }
      if (this.status) {
        return json(
          this.status,
          { error: { message: 'Refused' } },
          { location: 'https://elsewhere.test/' },
        )
      }
      if (request.headers.authorization !== `Bearer ${API_KEY}`) {
        return json(401, { error: { message: 'Unauthorized' } })
      }
      const known = [
        '/agent-configs/3/generations/latest',
        '/projects/7/agent-config/generations/latest',
      ]
      if (!known.includes(request.url ?? '')) {
        return json(404, { error: { message: 'Not found' } })
      }
      if (!this.current) return json(404, { error: { message: 'Generation not found' } })
      return json(200, { generation: this.current })
    })
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`
  }

  async stop() {
    await new Promise((resolve) => this.server?.close(resolve))
  }
}

/** An `Io` that records what is printed and answers questions from a list. */
export function recordingIo(
  options: { interactive?: boolean; answers?: boolean[]; stdin?: string } = {},
) {
  const answers = [...(options.answers ?? [])]
  const lines: string[] = []
  const questions: string[] = []
  const io: Io = {
    interactive: options.interactive ?? false,
    log: (message) => lines.push(message),
    warn: (message) => lines.push(message),
    async confirm(message) {
      questions.push(message)
      return answers.shift() ?? false
    },
    secret: async () => options.stdin ?? '',
    readStdin: async () => options.stdin ?? '',
  }
  return { io, lines, questions, output: () => lines.join('\n') }
}

export async function tempDir() {
  const path = await mkdtemp(join(tmpdir(), 'coreloom-uml-cli-'))
  return { path, cleanup: () => rm(path, { recursive: true, force: true }) }
}

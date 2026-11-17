import { writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { checkConformance } from '../src/check-conformance.ts'
import type { ConformanceReport } from '../src/code-maps-api.ts'
import { CliError, ExitCode } from '../src/errors.ts'
import type { CommandRunner } from '../src/run-command.ts'
import { API_KEY, recordingIo, tempDir } from './fixtures.ts'

function report(findings: ConformanceReport['diagrams'][number]['findings']): ConformanceReport {
  const counts = {
    error: findings.filter((finding) => finding.level === 'error').length,
    warning: findings.filter((finding) => finding.level === 'warning').length,
  }
  return {
    codeMap: {
      id: 12,
      repositoryUrl: 'https://github.com/acme/shop',
      branch: 'main',
      commitSha: '0123456789abcdef0123',
      createdAt: '2026-11-17T05:00:00.000Z',
    },
    counts,
    diagrams: [
      {
        diagramId: 3,
        title: 'Packages',
        kind: 'package',
        architectureId: 2,
        architectureTitle: 'API',
        counts,
        findings,
      },
    ],
    notChecked: 1,
    undocumentedProcesses: 4,
  }
}

const ERROR = {
  kind: 'missing-in-code' as const,
  elementId: 'billing',
  level: 'error' as const,
  message: 'billing is not in the code',
}
const WARNING = {
  kind: 'dependency-not-drawn' as const,
  from: 'projects',
  to: 'architectures',
  count: 2,
  evidence: [],
  level: 'warning' as const,
  message:
    "projects depends on architectures in the code (2 links), but the diagram doesn't show it",
}

/** A fake API: the conformance of project 7, and the upload of a map that becomes map 13. */
class ConformanceApi {
  current: ConformanceReport = report([WARNING])
  reply: { status: number; body: unknown } | null = null
  readonly requests: { method: string; url: string }[] = []
  private server: Server | null = null
  url = ''

  async start() {
    this.server = createServer((request, response) => {
      request.resume()
      request.on('end', () => {
        this.requests.push({ method: request.method ?? '', url: request.url ?? '' })
        const json = (status: number, body: unknown) => {
          response.writeHead(status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(body))
        }
        if (this.reply) return json(this.reply.status, this.reply.body)
        if (request.headers.authorization !== `Bearer ${API_KEY}`) {
          return json(401, { error: { message: 'Unauthorized' } })
        }
        const url = new URL(request.url ?? '', 'http://x')
        if (request.method === 'POST' && url.pathname === '/projects/7/code-maps') {
          return json(201, {
            codeMap: { id: 13, projectId: 7, nodeCount: 3, edgeCount: 2, branch: null },
          })
        }
        if (request.method === 'GET' && url.pathname === '/projects/7/code-maps/conformance') {
          const id = url.searchParams.get('codeMapId')
          return json(200, {
            ...this.current,
            codeMap: { ...this.current.codeMap, id: id ? Number(id) : 12 },
          })
        }
        return json(404, { error: { message: 'Project not found' } })
      })
    })
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`
  }

  async stop() {
    await new Promise((resolve) => this.server?.close(resolve))
  }
}

/** Neither Git nor graphify: the map is labelled with nothing. */
const noTools: CommandRunner = async (command) => ({
  code: null,
  stdout: '',
  stderr: `spawn ${command} ENOENT`,
})

let api: ConformanceApi
let dir: Awaited<ReturnType<typeof tempDir>>
let env: NodeJS.ProcessEnv

beforeEach(async () => {
  api = new ConformanceApi()
  await api.start()
  dir = await tempDir()
  env = { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: dir.path }
})

afterEach(async () => {
  await api.stop()
  await dir.cleanup()
})

function check(options: Partial<Parameters<typeof checkConformance>[0]> = {}) {
  const recorder = recordingIo()
  const run = checkConformance({
    cwd: dir.path,
    io: recorder.io,
    env,
    apiUrl: api.url,
    project: '7',
    run: noTools,
    ...options,
  })
  return { run, recorder }
}

it('passes on warnings by default and lists every finding', async () => {
  const { run, recorder } = check()

  expect(await run).toBe(ExitCode.Ok)
  expect(api.requests).toEqual([{ method: 'GET', url: '/projects/7/code-maps/conformance' }])
  const output = recorder.output()
  expect(output).toContain(
    'Diagrams of project 7 against code map 12 (branch main, commit 0123456789ab):',
  )
  expect(output).toContain('API / Packages (package): 0 errors, 1 warning')
  expect(output).toContain(`! warning ${WARNING.message}`)
  expect(output).toContain('1 diagram not checked')
  expect(output).toContain('4 processes no diagram documents')
  expect(output).toContain('Passed: nothing at error level or above (0 errors, 1 warning).')
})

it('fails with code 5 on an error, or on a warning with --fail-on warning', async () => {
  const warned = check({ failOn: 'warning' })
  expect(await warned.run).toBe(ExitCode.Nonconformant)
  expect(warned.recorder.output()).toContain(`✗ warning ${WARNING.message}`)
  expect(warned.recorder.output()).toContain('Failed: 1 finding at warning level or above')

  api.current = report([WARNING, ERROR])
  const errored = check()
  expect(await errored.run).toBe(ExitCode.Nonconformant)
  const lines = errored.recorder.lines
  expect(lines.indexOf(`    ✗ error   ${ERROR.message}`)).toBeLessThan(
    lines.indexOf(`    ! warning ${WARNING.message}`),
  )
})

it('prints one JSON object with --json', async () => {
  api.current = report([ERROR])
  const { run, recorder } = check({ json: true, map: '9' })

  expect(await run).toBe(ExitCode.Nonconformant)
  expect(api.requests[0]?.url).toBe('/projects/7/code-maps/conformance?codeMapId=9')
  expect(recorder.lines).toHaveLength(1)
  expect(JSON.parse(recorder.lines[0] ?? '')).toMatchObject({
    ok: false,
    exitCode: 5,
    failOn: 'error',
    projectId: 7,
    codeMap: { id: 9 },
    counts: { error: 1, warning: 0 },
  })
})

it('sends a map first with --push, then checks that map', async () => {
  await writeFile(
    join(dir.path, 'graph.json'),
    JSON.stringify({
      directed: true,
      multigraph: false,
      graph: { schema_version: 1, graphify_version: '0.9.108' },
      nodes: [
        {
          id: 'src_a_ts',
          label: 'a.ts',
          file_type: 'code',
          source_file: 'src/a.ts',
          source_location: 'L1',
          community: 0,
        },
      ],
      links: [],
    }),
  )
  const { run, recorder } = check({ push: true, graph: 'graph.json', json: true })

  expect(await run).toBe(ExitCode.Ok)
  expect(api.requests).toEqual([
    { method: 'POST', url: '/projects/7/code-maps' },
    { method: 'GET', url: '/projects/7/code-maps/conformance?codeMapId=13' },
  ])
  // What `map push` says stays off stdout: the last line is the JSON object.
  expect(JSON.parse(recorder.lines.at(-1) ?? '')).toMatchObject({ ok: true, codeMap: { id: 13 } })
})

it('says what to do when no map is ready, and refuses bad options', async () => {
  api.reply = { status: 409, body: { error: { message: 'No code map is ready in this project' } } }
  await expect(check().run).rejects.toThrow(
    'No code map is ready in project 7: run `coreloom-uml map push` first, or pass --push.',
  )
  api.reply = null

  await expect(check({ failOn: 'info' }).run).rejects.toThrow(
    'Invalid --fail-on: info (expected error or warning).',
  )
  await expect(check({ push: true, map: '3' }).run).rejects.toThrow(
    'Pass either --push or --map, not both.',
  )
  await expect(check({ graph: 'graph.json' }).run).rejects.toThrow(
    '--graph is only read with --push.',
  )
  await expect(check({ project: undefined }).run).rejects.toThrow(CliError)
  await expect(check({ env: { XDG_CONFIG_HOME: dir.path } }).run).rejects.toThrow('No API key')
  expect(api.requests).toHaveLength(1)
})

it('reads a refused key and an unexpected answer as errors', async () => {
  api.reply = { status: 403, body: { error: { message: 'Forbidden' } } }
  await expect(check().run).rejects.toThrow('The API key lacks the read ability.')
  api.reply = { status: 200, body: { hello: 'world' } }
  await expect(check().run).rejects.toThrow('Unexpected answer')
})

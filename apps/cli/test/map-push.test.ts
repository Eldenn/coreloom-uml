import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parseCodeMap } from '@coreloom-uml/codemap'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CODE_MAP_UPLOAD_NAME } from '../src/code-maps-api.ts'
import { CliError } from '../src/errors.ts'
import { remoteWebUrl } from '../src/git.ts'
import { mapPush } from '../src/map-push.ts'
import type { CommandRunner } from '../src/run-command.ts'
import { API_KEY, recordingIo, tempDir } from './fixtures.ts'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

/** A small `graph.json` as graphify 0.9.108 writes it: one file, one class, one method. */
function graphifyGraph(schemaVersion = 1) {
  return {
    directed: true,
    multigraph: false,
    graph: { schema_version: schemaVersion, graphify_version: '0.9.108' },
    nodes: [
      {
        id: 'src_shop_ts',
        label: 'shop.ts',
        file_type: 'code',
        source_file: 'src/shop.ts',
        source_location: 'L1',
        community: 0,
      },
      {
        id: 'src_shop_cart',
        label: 'Cart',
        _callable_class: true,
        file_type: 'code',
        source_file: 'src/shop.ts',
        source_location: 'L3',
        community: 0,
      },
      {
        id: 'src_shop_cart_add',
        label: '.add()',
        file_type: 'code',
        source_file: 'src/shop.ts',
        source_location: 'L5',
        community: 0,
      },
      { id: 'readme', label: 'README.md', file_type: 'document', source_file: 'README.md' },
    ],
    links: [
      {
        source: 'src_shop_ts',
        target: 'src_shop_cart',
        relation: 'contains',
        confidence: 'EXTRACTED',
      },
      {
        source: 'src_shop_cart',
        target: 'src_shop_cart_add',
        relation: 'method',
        confidence: 'EXTRACTED',
      },
    ],
  }
}

type Upload = {
  url: string
  authorization: string | undefined
  form: FormData
}

/** A fake `POST /projects/7/code-maps` that keeps what it receives. */
class CodeMapsApi {
  /** Answer with this status and body instead of storing the map. */
  reply: { status: number; body: unknown } | null = null
  readonly uploads: Upload[] = []
  private server: Server | null = null
  url = ''

  async start() {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', async () => {
        const json = (status: number, body: unknown) => {
          response.writeHead(status, { 'content-type': 'application/json' })
          response.end(JSON.stringify(body))
        }
        if (this.reply) return json(this.reply.status, this.reply.body)
        if (request.headers.authorization !== `Bearer ${API_KEY}`) {
          return json(401, { error: { message: 'Unauthorized' } })
        }
        if (request.method !== 'POST' || request.url !== '/projects/7/code-maps') {
          return json(404, { error: { message: 'Project not found' } })
        }
        const form = await new Response(Buffer.concat(chunks), {
          headers: { 'content-type': request.headers['content-type'] ?? '' },
        }).formData()
        this.uploads.push({ url: request.url, authorization: request.headers.authorization, form })
        const map = parseCodeMap(
          JSON.parse(
            gunzipSync(Buffer.from(await (form.get('file') as File).arrayBuffer())).toString(),
          ),
        )
        if (!map.ok) return json(422, { error: { message: 'Refused', problems: map.problems } })
        return json(201, {
          codeMap: {
            id: 12,
            projectId: 7,
            nodeCount: map.map.header.nodeCount,
            edgeCount: map.map.header.edgeCount,
            branch: form.get('branch'),
            commitSha: form.get('commitSha'),
          },
        })
      })
    })
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`
  }

  async stop() {
    await new Promise((resolve) => this.server?.close(resolve))
  }
}

type Call = { command: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined }

/**
 * A fake `git` (a clean checkout of `main` with an `origin` holding a token) and, when
 * `graphify` is set, a fake graphify that writes `graphify-out/graph.json` on `update`.
 */
function fakeRunner(options: { graphify?: string | false; remote?: string; dirty?: boolean } = {}) {
  const calls: Call[] = []
  const run: CommandRunner = async (command, args, { cwd, env }) => {
    calls.push({ command, args, env })
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' })
    if (command === 'git') {
      const line = args.join(' ')
      if (line === 'rev-parse HEAD') return ok(`${COMMIT}\n`)
      if (line === 'rev-parse --abbrev-ref HEAD') return ok('main\n')
      if (line === 'status --porcelain') {
        return ok(
          `?? .graphifyignore\n?? graphify-out/\n${options.dirty ? ' M src/shop.ts\n' : ''}`,
        )
      }
      if (line === 'remote get-url origin') {
        return ok(`${options.remote ?? 'https://x-access-token:secret@github.com/acme/shop.git'}\n`)
      }
      return { code: 1, stdout: '', stderr: 'unknown' }
    }
    if (command === 'graphify' && options.graphify) {
      if (args[0] === '--version') return ok(`graphify ${options.graphify}\n`)
      if (args[0] === 'update') {
        await mkdir(join(cwd, 'graphify-out'), { recursive: true })
        await writeFile(join(cwd, 'graphify-out', 'graph.json'), JSON.stringify(graphifyGraph()))
      }
      return ok()
    }
    return { code: null, stdout: '', stderr: `spawn ${command} ENOENT` }
  }
  return { run, calls }
}

let api: CodeMapsApi
let dir: Awaited<ReturnType<typeof tempDir>>
let env: NodeJS.ProcessEnv

beforeEach(async () => {
  api = new CodeMapsApi()
  await api.start()
  dir = await tempDir()
  env = { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: dir.path, OPENAI_API_KEY: 'sk-x' }
})

afterEach(async () => {
  await api.stop()
  await dir.cleanup()
})

async function writeGraph(path: string, value: unknown = graphifyGraph()) {
  await mkdir(join(dir.path, path, '..'), { recursive: true })
  await writeFile(join(dir.path, path), JSON.stringify(value))
}

it('sends the map built from a graph.json, labelled with Git, never the code', async () => {
  await writeGraph('out/graph.json')
  const { run } = fakeRunner()
  const recorder = recordingIo()

  const code = await mapPush({
    cwd: dir.path,
    io: recorder.io,
    env,
    run,
    apiUrl: api.url,
    project: '7',
    graph: 'out/graph.json',
    now: () => new Date('2026-11-14T12:00:00Z'),
  })

  expect(code).toBe(0)
  expect(api.uploads).toHaveLength(1)
  const { form } = api.uploads[0] as Upload
  // The token in the remote never leaves the machine.
  expect(form.get('repositoryUrl')).toBe('https://github.com/acme/shop')
  expect(form.get('branch')).toBe('main')
  expect(form.get('commitSha')).toBe(COMMIT)
  const file = form.get('file') as File
  expect(file.name).toBe(CODE_MAP_UPLOAD_NAME)
  const map = JSON.parse(gunzipSync(Buffer.from(await file.arrayBuffer())).toString())
  expect(map.header).toMatchObject({
    extractor: { name: 'graphify', version: '0.9.108' },
    repository: 'https://github.com/acme/shop',
    branch: 'main',
    commit: COMMIT,
    generatedAt: '2026-11-14T12:00:00.000Z',
  })
  expect(map.nodes.map((node: { key: string }) => node.key)).toEqual([
    'src/shop.ts',
    'src/shop.ts#Cart',
    'src/shop.ts#Cart.add',
  ])
  expect(recorder.output()).toContain('Code map 12 stored in project 7: 3 nodes, 2 links.')
})

it('runs graphify without a model or a key, and skips build output', async () => {
  const { run, calls } = fakeRunner({ graphify: '0.9.108' })
  const recorder = recordingIo()

  await mapPush({ cwd: dir.path, io: recorder.io, env, run, apiUrl: api.url, project: '7' })

  const graphify = calls.filter((call) => call.command === 'graphify')
  expect(graphify.map((call) => call.args.join(' '))).toEqual([
    '--version',
    'update . --no-cluster --force',
    'cluster-only . --no-viz --no-label',
  ])
  for (const call of graphify) {
    expect(call.env).toMatchObject({ GRAPHIFY_BACKEND: 'none', GRAPHIFY_QUERY_LOG_DISABLE: '1' })
    expect(call.env).not.toHaveProperty('CORELOOM_UML_API_KEY')
    expect(call.env).not.toHaveProperty('OPENAI_API_KEY')
  }
  expect(await readFile(join(dir.path, '.graphifyignore'), 'utf8')).toContain('node_modules/')
  expect(recorder.output()).not.toContain('found;')
  // Only graphify's own files are untracked: the tree counts as clean.
  expect(recorder.output()).not.toContain('uncommitted changes')
  expect(api.uploads).toHaveLength(1)
})

it('keeps an existing .graphifyignore and warns about another graphify version', async () => {
  await writeFile(join(dir.path, '.graphifyignore'), 'fixtures/\n')
  const { run } = fakeRunner({ graphify: '0.10.0' })
  const recorder = recordingIo()

  await mapPush({ cwd: dir.path, io: recorder.io, env, run, apiUrl: api.url, project: '7' })

  expect(await readFile(join(dir.path, '.graphifyignore'), 'utf8')).toBe('fixtures/\n')
  expect(recorder.output()).toContain('graphify 0.10.0 found')
})

it('sends the last graph when graphify is not installed, and says so', async () => {
  await writeGraph('graphify-out/graph.json')
  const recorder = recordingIo()

  await mapPush({
    cwd: dir.path,
    io: recorder.io,
    env,
    run: fakeRunner().run,
    apiUrl: api.url,
    project: '7',
  })

  expect(recorder.output()).toContain('graphify is not installed: sending the')
  expect(api.uploads).toHaveLength(1)
})

it('explains how to install graphify when there is nothing to send', async () => {
  const push = mapPush({
    cwd: dir.path,
    io: recordingIo().io,
    env,
    run: fakeRunner().run,
    apiUrl: api.url,
    project: '7',
  })
  await expect(push).rejects.toThrow(/uv tool install graphifyy==0\.9\.108/)
  expect(api.uploads).toHaveLength(0)
})

it('builds the map without a key, a project or a request on --dry-run', async () => {
  await writeGraph('graph.json')
  const recorder = recordingIo()

  const code = await mapPush({
    cwd: dir.path,
    io: recorder.io,
    env: {},
    run: fakeRunner({ dirty: true }).run,
    graph: 'graph.json',
    dryRun: true,
  })

  expect(code).toBe(0)
  expect(recorder.output()).toContain('Code map: 3 nodes, 2 links')
  expect(recorder.output()).toContain('Dry run: nothing sent')
  expect(api.uploads).toHaveLength(0)
})

it('warns that uncommitted changes are labelled with the last commit', async () => {
  const recorder = recordingIo()
  await mapPush({
    cwd: dir.path,
    io: recorder.io,
    env,
    run: fakeRunner({ graphify: '0.9.108', dirty: true }).run,
    apiUrl: api.url,
    project: '7',
  })
  expect(recorder.output()).toContain('uncommitted changes')
})

it('takes the project from the manifest, and the label from the options', async () => {
  await writeGraph('graph.json')
  await writeFile(
    join(dir.path, '.coreloom-uml.json'),
    JSON.stringify({ apiUrl: api.url, projectId: 7, generationId: 1, revision: 1, files: [] }),
  )

  await mapPush({
    cwd: dir.path,
    io: recordingIo().io,
    env,
    run: fakeRunner().run,
    graph: 'graph.json',
    repository: 'https://gitlab.example.com/acme/shop',
    branch: 'release',
    commit: 'ABCDEF1',
  })

  const { form } = api.uploads[0] as Upload
  expect(form.get('repositoryUrl')).toBe('https://gitlab.example.com/acme/shop')
  expect(form.get('branch')).toBe('release')
  expect(form.get('commitSha')).toBe('abcdef1')
})

describe('refusals', () => {
  it('needs a project and a key before reading any code', async () => {
    const { run, calls } = fakeRunner({ graphify: '0.9.108' })
    const base = { cwd: dir.path, io: recordingIo().io, run, apiUrl: api.url }
    await expect(mapPush({ ...base, env })).rejects.toThrow(/--project <id>/)
    await expect(mapPush({ ...base, env: {}, project: '7' })).rejects.toThrow(/No API key/)
    await expect(mapPush({ ...base, env, project: 'seven' })).rejects.toThrow(/Invalid project/)
    await expect(
      mapPush({ ...base, env, project: '7', repository: 'https://me:pw@github.com/a/b' }),
    ).rejects.toThrow(/credentials/)
    await expect(mapPush({ ...base, env, project: '7', commit: 'main' })).rejects.toThrow(
      /Invalid commit/,
    )
    expect(calls.filter((call) => call.command === 'graphify')).toHaveLength(0)
  })

  it('refuses a graph the importer cannot read, before sending it', async () => {
    await writeGraph('graph.json', graphifyGraph(2))
    const push = mapPush({
      cwd: dir.path,
      io: recordingIo().io,
      env,
      run: fakeRunner().run,
      apiUrl: api.url,
      project: '7',
      graph: 'graph.json',
    })
    await expect(push).rejects.toThrow(/Unsupported graphify schema_version 2/)
    expect(api.uploads).toHaveLength(0)
  })

  it.each([
    [403, { error: { message: 'Forbidden' } }, /lacks the write ability/],
    [404, { error: { message: 'Not found' } }, /project 7\)\. Check the id, and that code maps/],
    [
      422,
      { error: { message: 'The code map was refused', problems: ['Too many nodes'] } },
      /The code map was refused\.\n {2}- Too many nodes/,
    ],
    [302, null, /redirect/],
  ])('explains a %i answer', async (status, body, message) => {
    await writeGraph('graph.json')
    api.reply = { status, body }
    const push = mapPush({
      cwd: dir.path,
      io: recordingIo().io,
      env,
      run: fakeRunner().run,
      apiUrl: api.url,
      project: '7',
      graph: 'graph.json',
    })
    await expect(push).rejects.toThrow(CliError)
    await expect(push).rejects.toThrow(message)
  })
})

describe('remoteWebUrl', () => {
  it.each([
    ['git@github.com:acme/shop.git', 'https://github.com/acme/shop'],
    [
      'ssh://git@gitlab.example.com:2222/group/sub/shop.git',
      'https://gitlab.example.com/group/sub/shop',
    ],
    ['https://x-access-token:ghs_abc@github.com/acme/shop.git', 'https://github.com/acme/shop'],
    ['http://git.local:8080/acme/shop/', 'http://git.local:8080/acme/shop'],
    ['/srv/git/shop.git', null],
    ['file:///srv/git/shop.git', null],
    ['https://github.com/', null],
  ])('%s → %s', (remote, expected) => {
    expect(remoteWebUrl(remote)).toBe(expected)
  })
})

it('does not leave a graph behind when it only reads one', async () => {
  await writeGraph('graph.json')
  await mapPush({
    cwd: dir.path,
    io: recordingIo().io,
    env,
    run: fakeRunner({ graphify: '0.9.108' }).run,
    apiUrl: api.url,
    project: '7',
    graph: 'graph.json',
  })
  await expect(stat(join(dir.path, 'graphify-out'))).rejects.toThrow()
  await expect(stat(join(dir.path, '.graphifyignore'))).rejects.toThrow()
})

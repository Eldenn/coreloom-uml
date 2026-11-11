import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { HASH_MARKERS, wrapManagedBlock } from '@coreloom-uml/catalog'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliError, ExitCode } from '../src/errors.ts'
import { MANIFEST_FILE, readManifest } from '../src/manifest.ts'
import { type PullOptions, pull } from '../src/pull.ts'
import {
  API_KEY,
  FixtureApi,
  file,
  generation,
  recordingIo,
  settingsFile,
  tempDir,
} from './fixtures.ts'

const AGENTS = 'AGENTS.md'
const POINTER = 'docs/POINTER.md'

let api: FixtureApi
let dir: Awaited<ReturnType<typeof tempDir>>

beforeEach(async () => {
  api = new FixtureApi()
  await api.start()
  dir = await tempDir()
})

afterEach(async () => {
  await api.stop()
  await dir.cleanup()
})

const read = (path: string) => readFile(join(dir.path, path), 'utf8')
const exists = (path: string) =>
  stat(join(dir.path, path)).then(
    () => true,
    () => false,
  )

function run(options: Partial<PullOptions> = {}, io = recordingIo().io) {
  return pull({
    cwd: dir.path,
    io,
    env: { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: join(dir.path, '.config') },
    fetch,
    apiUrl: api.url,
    config: '3',
    ...options,
  })
}

const first = generation(1, [file(AGENTS, '# Conventions\n\n- One'), file(POINTER, '@AGENTS.md')])

describe('pull', () => {
  it('creates the files in an empty folder and writes the manifest', async () => {
    api.current = first
    const recorder = recordingIo()

    expect(await run({}, recorder.io)).toBe(ExitCode.Ok)

    expect(await read(AGENTS)).toBe(first.files[0]?.content)
    expect(await read(POINTER)).toBe(first.files[1]?.content)
    const manifest = await readManifest(dir.path)
    expect(manifest).toEqual({
      apiUrl: api.url,
      configId: 3,
      generationId: 1,
      revision: 1,
      files: [
        { path: AGENTS, blockHash: first.files[0]?.blockHash },
        { path: POINTER, blockHash: first.files[1]?.blockHash },
      ],
    })
    expect(JSON.stringify(manifest)).not.toContain(API_KEY)
    expect(api.requests[0]?.authorization).toBe(`Bearer ${API_KEY}`)
    expect(recorder.output()).toContain('Nested rules')
    expect(recorder.output()).toContain('tidy-tests: https://example.com/tidy-tests')
    // Only compatible skills with an https link are printed.
    expect(recorder.output()).not.toContain('not-a-link')
    expect(recorder.output()).not.toContain('loose-tests')
  })

  it('reads the configuration and the API URL from the manifest on the next pull', async () => {
    api.current = first
    await run()
    api.current = generation(2, [file(AGENTS, '# Conventions\n\n- Two'), first.files[1] as never])

    expect(await run({ config: undefined, apiUrl: undefined })).toBe(ExitCode.Ok)
    expect(await read(AGENTS)).toContain('- Two')
    expect(api.requests.at(-1)?.url).toBe('/agent-configs/3/generations/latest')
  })

  it('still pulls by project, and keeps a manifest written that way', async () => {
    api.current = first
    expect(await run({ config: undefined, project: '7' })).toBe(ExitCode.Ok)
    expect(await readManifest(dir.path)).toMatchObject({ projectId: 7 })
    api.current = generation(2, [file(AGENTS, '# Conventions\n\n- Two'), first.files[1] as never])

    expect(await run({ config: undefined })).toBe(ExitCode.Ok)
    expect(await read(AGENTS)).toContain('- Two')
    expect(api.requests.at(-1)?.url).toBe('/projects/7/agent-config/generations/latest')
    expect(await readManifest(dir.path)).not.toHaveProperty('configId')
  })

  it('needs a configuration the first time, and only one way to name it', async () => {
    await expect(run({ config: undefined })).rejects.toThrow(/--config/)
    await expect(run({ project: '7' })).rejects.toThrow(/not both/)
  })

  it('keeps the content and the frontmatter of a file without markers and adds the block at its end', async () => {
    api.current = generation(1, [file(AGENTS, '# Conventions')])
    const own = '---\ntitle: Mine\n---\n\n# My rules\n\nKeep this.\n'
    await writeFile(join(dir.path, AGENTS), own)

    await expect(run()).rejects.toThrow(/--yes/)
    expect(await read(AGENTS)).toBe(own)

    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await read(AGENTS)).toBe(`${own}\n${api.current.files[0]?.content}`)
  })

  it('asks before adding a block to an existing file', async () => {
    api.current = generation(1, [file(AGENTS, '# Conventions')])
    await writeFile(join(dir.path, AGENTS), '# Mine\n')
    const recorder = recordingIo({ interactive: true, answers: [false] })

    expect(await run({}, recorder.io)).toBe(ExitCode.Ok)
    expect(recorder.questions).toHaveLength(1)
    expect(await read(AGENTS)).toBe('# Mine\n')
    expect((await readManifest(dir.path))?.files).toEqual([])
  })

  it('replaces a block the last pull wrote and leaves the rest of the file alone', async () => {
    api.current = first
    await run()
    const own = `# Before\n\n${await read(AGENTS)}\n## After\n`
    await writeFile(join(dir.path, AGENTS), own)
    const next = generation(2, [file(AGENTS, '# Conventions\n\n- Two'), first.files[1] as never])
    api.current = next

    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await read(AGENTS)).toBe(`# Before\n\n${next.files[0]?.content}\n## After\n`)
  })

  it('stops with code 2 on a block edited by hand with --yes, then overwrites it with --force', async () => {
    api.current = first
    await run()
    const edited = (await read(AGENTS)).replace('- One', '- Mine')
    await writeFile(join(dir.path, AGENTS), edited)
    const manifestBefore = await read(MANIFEST_FILE)
    const next = generation(2, [file(AGENTS, '# Conventions\n\n- Two'), file(POINTER, 'changed')])
    api.current = next
    const recorder = recordingIo()

    expect(await run({ yes: true }, recorder.io)).toBe(ExitCode.EditedBlockKept)
    expect(recorder.output()).toContain('- - Mine')
    expect(recorder.output()).toContain('+ - Two')
    expect(await read(AGENTS)).toBe(edited)
    expect(await read(POINTER)).toBe(first.files[1]?.content)
    expect(await read(MANIFEST_FILE)).toBe(manifestBefore)

    expect(await run({ yes: true, force: true })).toBe(ExitCode.Ok)
    expect(await read(AGENTS)).toBe(next.files[0]?.content)
  })

  it('keeps a declined hand edit, writes the rest and exits with code 2', async () => {
    api.current = first
    await run()
    const edited = (await read(AGENTS)).replace('- One', '- Mine')
    await writeFile(join(dir.path, AGENTS), edited)
    api.current = generation(2, [file(AGENTS, '- Two'), file(POINTER, 'changed')])
    const recorder = recordingIo({ interactive: true, answers: [false] })

    expect(await run({}, recorder.io)).toBe(ExitCode.EditedBlockKept)
    expect(await read(AGENTS)).toBe(edited)
    expect(await read(POINTER)).toContain('changed')
    const manifest = await readManifest(dir.path)
    expect(manifest?.files.find((entry) => entry.path === AGENTS)?.blockHash).toBe(
      first.files[0]?.blockHash,
    )
  })

  it('removes the block of a file that left the generation, and the file once empty', async () => {
    api.current = generation(1, [file(AGENTS, 'a'), file(POINTER, 'p'), file('KEEP.md', 'k')])
    await run()
    await writeFile(join(dir.path, 'KEEP.md'), `# Mine\n\n${await read('KEEP.md')}`)
    api.current = generation(2, [file(AGENTS, 'a')])

    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await exists(POINTER)).toBe(false)
    expect(await read('KEEP.md')).toBe('# Mine\n')
    expect((await readManifest(dir.path))?.files.map((entry) => entry.path)).toEqual([AGENTS])
  })

  it.each([
    ['../x.md', /leaves the repository/],
    ['/etc/x.md', /absolute/],
    ['docs/../x.md', /leaves the repository/],
    ['./x.md', /not normalized/],
    ['docs\\x.md', /backslashes/],
  ])('refuses the path %s and writes nothing', async (path, reason) => {
    api.current = generation(1, [file(AGENTS, 'a'), file(path, 'x')])

    const error = await run({ yes: true }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CliError)
    expect((error as CliError).message).toMatch(reason)
    expect(await exists(AGENTS)).toBe(false)
    expect(await exists(MANIFEST_FILE)).toBe(false)
  })

  it('refuses a path through a symbolic link', async () => {
    const outside = await tempDir()
    try {
      await symlink(outside.path, join(dir.path, 'docs'))
      api.current = first
      await expect(run({ yes: true })).rejects.toThrow(/symbolic link/)
      expect(await exists(AGENTS)).toBe(false)
    } finally {
      await outside.cleanup()
    }
  })

  it('writes nothing with --dry-run and shows the diffs', async () => {
    api.current = first
    await mkdir(join(dir.path, 'docs'))
    const recorder = recordingIo()

    expect(await run({ dryRun: true }, recorder.io)).toBe(ExitCode.Ok)
    expect(await exists(AGENTS)).toBe(false)
    expect(await exists(MANIFEST_FILE)).toBe(false)
    expect(recorder.output()).toContain('+ - One')
    expect(recorder.output()).toContain('Dry run: nothing written.')
  })

  it('refuses a file whose markers are unbalanced', async () => {
    api.current = generation(1, [file(AGENTS, 'a')])
    await writeFile(join(dir.path, AGENTS), '<!-- coreloom-uml:begin -->\nno end\n')
    await expect(run({ yes: true })).rejects.toThrow(/Unbalanced/)
  })

  it('explains a refused key, a missing configuration and a redirect', async () => {
    api.current = first
    await expect(
      run({ env: { CORELOOM_UML_API_KEY: 'clu_wrong', XDG_CONFIG_HOME: dir.path } }),
    ).rejects.toThrow(/refused/)
    await expect(run({ config: '8' })).rejects.toThrow(/Not found \(configuration 8\)/)
    await expect(run({ config: 'abc' })).rejects.toThrow(/Invalid configuration id/)
    await expect(run({ config: undefined, project: 'abc' })).rejects.toThrow(/Invalid project id/)

    api.status = 302
    await expect(run()).rejects.toThrow(/redirect/)
    expect(api.requests.every((request) => !request.url.includes('elsewhere'))).toBe(true)
  })

  it('needs an API key', async () => {
    await expect(run({ env: { XDG_CONFIG_HOME: dir.path } })).rejects.toThrow(/No API key/)
  })

  it('needs an API URL', async () => {
    await expect(run({ apiUrl: undefined })).rejects.toThrow(/--api-url/)
  })
})

describe('pull, settings files', () => {
  const SETTINGS = '.claude/settings.json'
  const TOML = '.codex/config.toml'
  const json = (value: unknown) => settingsFile(SETTINGS, JSON.stringify(value, null, 2))
  const toml = (body: string) => settingsFile(TOML, wrapManagedBlock(body, HASH_MARKERS))
  const hook = (command: string) => ({ hooks: [{ type: 'command', command }] })
  const readJson = async () => JSON.parse(await read(SETTINGS))

  const one = generation(1, [
    json({
      permissions: { allow: ['Bash(pnpm lint)'], deny: ['Read(./.env)'] },
      hooks: { Stop: [hook('pnpm lint')] },
    }),
  ])
  const two = generation(2, [
    json({
      permissions: { allow: ['Bash(pnpm test)'], deny: ['Read(./.env)'] },
      hooks: { Stop: [hook('pnpm test')] },
    }),
  ])

  it('asks before writing settings, then creates the file and records what it wrote', async () => {
    api.current = one
    await expect(run()).rejects.toThrow(/--yes/)
    expect(await exists(SETTINGS)).toBe(false)

    const recorder = recordingIo({ interactive: true, answers: [true] })
    expect(await run({}, recorder.io)).toBe(ExitCode.Ok)
    expect(recorder.questions).toEqual([expect.stringContaining('write these settings?')])
    expect(recorder.output()).toContain('+       "Bash(pnpm lint)"')
    expect(await read(SETTINGS)).toBe(one.files[0]?.content)
    expect((await readManifest(dir.path))?.files).toEqual([
      {
        path: SETTINGS,
        blockHash: one.files[0]?.blockHash,
        content: one.files[0]?.content.trimEnd(),
      },
    ])
  })

  it('merges into the owner’s settings, and replaces only the entries it wrote', async () => {
    await mkdir(join(dir.path, '.claude'))
    const own = {
      model: 'mine',
      permissions: { allow: ['Bash(ls)'], ask: ['Bash(git push *)'] },
      hooks: { Stop: [hook('say done')], PreToolUse: [] },
    }
    await writeFile(join(dir.path, SETTINGS), JSON.stringify(own))
    api.current = one
    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await readJson()).toEqual({
      model: 'mine',
      permissions: {
        allow: ['Bash(ls)', 'Bash(pnpm lint)'],
        ask: ['Bash(git push *)'],
        deny: ['Read(./.env)'],
      },
      hooks: { Stop: [hook('say done'), hook('pnpm lint')], PreToolUse: [] },
    })

    api.current = two
    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await readJson()).toEqual({
      model: 'mine',
      permissions: {
        allow: ['Bash(ls)', 'Bash(pnpm test)'],
        ask: ['Bash(git push *)'],
        deny: ['Read(./.env)'],
      },
      hooks: { Stop: [hook('say done'), hook('pnpm test')], PreToolUse: [] },
    })

    // Pulling the same generation again changes nothing, and asks nothing.
    const before = await read(SETTINGS)
    expect(await run()).toBe(ExitCode.Ok)
    expect(await read(SETTINGS)).toBe(before)
  })

  it('stops with code 2 when an entry it wrote was removed by hand, and restores it with --force', async () => {
    api.current = one
    await run({ yes: true })
    const edited = JSON.stringify({ permissions: { allow: ['Bash(pnpm lint)'], deny: [] } })
    await writeFile(join(dir.path, SETTINGS), edited)
    api.current = two

    expect(await run({ yes: true })).toBe(ExitCode.EditedBlockKept)
    expect(await read(SETTINGS)).toBe(edited)

    expect(await run({ yes: true, force: true })).toBe(ExitCode.Ok)
    expect(await read(SETTINGS)).toBe(two.files[0]?.content)
  })

  it('takes its entries out when the file leaves the generation, and deletes a file left empty', async () => {
    api.current = one
    await run({ yes: true })
    const mine = { ...(await readJson()), model: 'mine' }
    await writeFile(join(dir.path, SETTINGS), JSON.stringify(mine))
    api.current = generation(2, [file(AGENTS, 'a')])
    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await readJson()).toEqual({ model: 'mine' })

    api.current = one
    await writeFile(join(dir.path, SETTINGS), '')
    await run({ yes: true })
    api.current = generation(2, [file(AGENTS, 'a')])
    await run({ yes: true })
    expect(await exists(SETTINGS)).toBe(false)
  })

  it('refuses settings it cannot read as JSON, and a path through a symbolic link', async () => {
    api.current = one
    await mkdir(join(dir.path, '.claude'))
    await writeFile(join(dir.path, SETTINGS), '{ // mine\n}')
    await expect(run({ yes: true })).rejects.toThrow(/not a JSON object/)
    expect(await read(SETTINGS)).toBe('{ // mine\n}')

    await mkdir(join(dir.path, 'real'))
    await symlink(join(dir.path, 'real'), join(dir.path, '.codex'))
    api.current = generation(1, [toml('sandbox_mode = "read-only"')])
    await expect(run({ yes: true })).rejects.toThrow(/symbolic link/)
  })

  it('puts the TOML block before the owner’s tables and replaces it on the next pull', async () => {
    await mkdir(join(dir.path, '.codex'))
    const own = 'model = "mine"\n\n[profiles.fast]\nsandbox_mode = "danger-full-access"\n'
    await writeFile(join(dir.path, TOML), own)
    api.current = generation(1, [toml('sandbox_mode = "read-only"')])
    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await read(TOML)).toBe(`${api.current.files[0]?.content}\n${own}`)

    api.current = generation(2, [toml('sandbox_mode = "workspace-write"')])
    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await read(TOML)).toBe(`${api.current.files[0]?.content}\n${own}`)
  })

  it('refuses a TOML file that already sets a managed key', async () => {
    await mkdir(join(dir.path, '.codex'))
    await writeFile(join(dir.path, TOML), 'sandbox_mode = "danger-full-access"\n')
    api.current = generation(1, [toml('sandbox_mode = "read-only"')])
    await expect(run({ yes: true })).rejects.toThrow(/already sets sandbox_mode/)
  })
})

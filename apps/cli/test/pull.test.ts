import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliError, ExitCode } from '../src/errors.ts'
import { MANIFEST_FILE, readManifest } from '../src/manifest.ts'
import { type PullOptions, pull } from '../src/pull.ts'
import { API_KEY, FixtureApi, file, generation, recordingIo, tempDir } from './fixtures.ts'

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
    project: '7',
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
      projectId: 7,
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
  })

  it('reads the project and the API URL from the manifest on the next pull', async () => {
    api.current = first
    await run()
    api.current = generation(2, [file(AGENTS, '# Conventions\n\n- Two'), first.files[1] as never])

    expect(await run({ project: undefined, apiUrl: undefined })).toBe(ExitCode.Ok)
    expect(await read(AGENTS)).toContain('- Two')
  })

  it('needs a project the first time', async () => {
    await expect(run({ project: undefined })).rejects.toThrow(/--project/)
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

  it('explains a refused key, a missing project and a redirect', async () => {
    api.current = first
    await expect(
      run({ env: { CORELOOM_UML_API_KEY: 'clu_wrong', XDG_CONFIG_HOME: dir.path } }),
    ).rejects.toThrow(/refused/)
    await expect(run({ project: '8' })).rejects.toThrow(/Project not found \(project 8\)/)
    await expect(run({ project: 'abc' })).rejects.toThrow(/Invalid project id/)

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

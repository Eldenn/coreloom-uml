import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CliError, ExitCode } from '../src/errors.ts'
import { type SkillCopy, type SkillsAddOptions, skillsAdd } from '../src/skills-add.ts'
import { API_KEY, FixtureApi, recordingIo, tempDir } from './fixtures.ts'

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

function copy(overrides: Partial<SkillCopy> = {}): SkillCopy {
  return {
    slug: 'tidy-tests',
    name: 'tidy-tests',
    repository: 'acme/skills',
    commit: 'a'.repeat(40),
    license: 'MIT',
    files: [
      { path: 'SKILL.md', executable: false, content: '---\nname: tidy-tests\n---\n' },
      { path: 'scripts/run.sh', executable: true, content: '#!/bin/sh\necho run\n' },
    ],
    ...overrides,
  }
}

function run(options: Partial<SkillsAddOptions> = {}, io = recordingIo().io) {
  return skillsAdd({
    cwd: dir.path,
    io,
    slugs: ['tidy-tests'],
    env: { CORELOOM_UML_API_KEY: API_KEY, XDG_CONFIG_HOME: join(dir.path, '.config') },
    fetch,
    apiUrl: api.url,
    ...options,
  })
}

describe('skills add', () => {
  it('writes the approved copy once per folder of the targets, scripts executable', async () => {
    api.copies['tidy-tests'] = copy()
    const recorder = recordingIo()
    const code = await run({ targets: ['claude-code', 'codex', 'cursor'] }, recorder.io)

    expect(code).toBe(ExitCode.Ok)
    expect(await read('.claude/skills/tidy-tests/SKILL.md')).toContain('name: tidy-tests')
    expect(await read('.agents/skills/tidy-tests/scripts/run.sh')).toContain('echo run')
    const mode = (await stat(join(dir.path, '.agents/skills/tidy-tests/scripts/run.sh'))).mode
    expect(mode & 0o111).not.toBe(0)
    expect(recorder.output()).toContain('licence MIT')
    expect(api.requests.map((request) => request.url)).toEqual(['/skills/tidy-tests/copy'])
  })

  it('installs in .agents/skills by default, and is idempotent', async () => {
    api.copies['tidy-tests'] = copy()
    await run()
    expect(await exists('.agents/skills/tidy-tests/SKILL.md')).toBe(true)
    expect(await exists('.claude')).toBe(false)

    const recorder = recordingIo()
    expect(await run({}, recorder.io)).toBe(ExitCode.Ok)
    expect(recorder.output()).toContain('up to date    .agents/skills/tidy-tests')
  })

  it('asks before replacing or removing a file, and refuses without a terminal', async () => {
    api.copies['tidy-tests'] = copy()
    await run()
    await writeFile(join(dir.path, '.agents/skills/tidy-tests/notes.md'), 'mine\n')
    api.copies['tidy-tests'] = copy({
      files: [{ path: 'SKILL.md', executable: false, content: '---\nname: tidy-tests\n---\nv2\n' }],
    })

    await expect(run()).rejects.toThrow(/--yes/)

    const declined = recordingIo({ interactive: true, answers: [false] })
    expect(await run({}, declined.io)).toBe(ExitCode.EditedBlockKept)
    expect(await exists('.agents/skills/tidy-tests/notes.md')).toBe(true)

    expect(await run({ yes: true })).toBe(ExitCode.Ok)
    expect(await read('.agents/skills/tidy-tests/SKILL.md')).toContain('v2')
    expect(await exists('.agents/skills/tidy-tests/notes.md')).toBe(false)
    expect(await exists('.agents/skills/tidy-tests/scripts/run.sh')).toBe(false)
  })

  it('writes nothing on a dry run', async () => {
    api.copies['tidy-tests'] = copy()
    const recorder = recordingIo()
    await run({ dryRun: true }, recorder.io)
    expect(recorder.output()).toContain('write         .agents/skills/tidy-tests/SKILL.md')
    expect(await exists('.agents')).toBe(false)
  })

  it('refuses a path or a name that leaves the folder, and a symbolic link in it', async () => {
    api.copies['tidy-tests'] = copy({
      files: [{ path: '../../escape.md', executable: false, content: 'x' }],
    })
    await expect(run()).rejects.toThrow(/leaves the repository/)

    api.copies['tidy-tests'] = copy({ name: '../escape' })
    await expect(run()).rejects.toThrow(/Refused skill name/)

    api.copies['tidy-tests'] = copy()
    await mkdir(join(dir.path, '.agents/skills/tidy-tests'), { recursive: true })
    await symlink('/etc', join(dir.path, '.agents/skills/tidy-tests/link'))
    await expect(run()).rejects.toThrow(/symbolic link/)
  })

  it('names a skill without an approved copy, an unknown target and a bad slug', async () => {
    await expect(run()).rejects.toThrow(/approved/)
    await expect(run({ targets: ['vim'] })).rejects.toThrow(CliError)
    await expect(run({ slugs: ['../x'] })).rejects.toThrow(/Invalid skill/)
  })
})

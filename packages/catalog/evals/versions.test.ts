/**
 * The versions the evals run with, kept equal wherever they are written down (CI, the API's image,
 * the evals image and its locks), how the evals image pins what it downloads, and, inside the
 * evals image only, the tools it really holds. Offline: nothing here calls a provider.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENT_CLI_PACKAGES, AGENT_CLI_VERSIONS, HARBOR_VERSION } from './src/versions.ts'

const root = join(import.meta.dirname, '../../..')
const infra = join(root, 'infra/evals')
const read = (...path: string[]) => readFileSync(join(...path), 'utf8')
const dockerfile = read(infra, 'Dockerfile')
const lockDockerfile = read(infra, 'lock.Dockerfile')

/** The npm packages the evals image installs with `npm ci`, and their lock. */
const agents = JSON.parse(read(infra, 'agents/package.json')) as {
  dependencies: Record<string, string>
}
const agentsLock = JSON.parse(read(infra, 'agents/package-lock.json')) as {
  packages: Record<string, { version?: string; integrity?: string; resolved?: string }>
}

/** pnpm's version, as the root package.json's `packageManager` names it. */
const pnpmVersion = (
  JSON.parse(read(root, 'package.json')) as { packageManager: string }
).packageManager.replace(/^pnpm@/, '')

/** The version in the tag of an image the evals Dockerfile is built from, by its name. */
const imageVersion = (pattern: RegExp) => dockerfile.match(pattern)?.[1]
const DOCKER_VERSION = imageVersion(/^FROM --platform=\S+ docker:(\d+\.\d+\.\d+)-cli@/m)
const COMPOSE_VERSION = imageVersion(/^FROM --platform=\S+ docker\/compose-bin:v(\d+\.\d+\.\d+)@/m)

describe('the pinned versions', () => {
  const ci = read(root, '.github/workflows/ci.yml')

  it.each(
    Object.entries(AGENT_CLI_VERSIONS),
  )('run %s at the version CI and the evals image install', (target, version) => {
    const name = AGENT_CLI_PACKAGES[target as keyof typeof AGENT_CLI_PACKAGES]
    expect(ci).toContain(`${name}@${version}`)
    expect(agents.dependencies[name]).toBe(version)
    expect(agentsLock.packages[`node_modules/${name}`]?.version).toBe(version)
  })

  it("run Claude Code at the API image's version", () => {
    const api = read(root, 'apps/api/Dockerfile')
    const pinned = [...api.matchAll(/@anthropic-ai\/claude-code@(\S+)/g)].map((match) => match[1])
    expect(pinned.length).toBeGreaterThan(0)
    for (const version of pinned) expect(version).toBe(AGENT_CLI_VERSIONS['claude-code'])
  })

  it("give a trial's agent the repository's pnpm", () => {
    expect(pnpmVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(agents.dependencies.pnpm).toBe(pnpmVersion)
    expect(agentsLock.packages['node_modules/pnpm']?.version).toBe(pnpmVersion)
  })

  it('install exactly the agents and pnpm, every package of the lock by its integrity', () => {
    expect(Object.keys(agents.dependencies).sort()).toEqual(
      [...Object.values(AGENT_CLI_PACKAGES), 'pnpm'].sort(),
    )
    for (const version of Object.values(agents.dependencies))
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    const locked = Object.entries(agentsLock.packages).filter(([path]) => path !== '')
    expect(locked.length).toBeGreaterThan(0)
    for (const [, entry] of locked) {
      expect(entry.integrity).toMatch(/^sha512-/)
      expect(entry.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//)
    }
  })

  it('pin Harbor to an exact version', () => {
    expect(HARBOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('are the ones the evals image is built with', () => {
    expect(dockerfile).toContain(`ARG HARBOR_VERSION=${HARBOR_VERSION}\n`)
    const lock = read(infra, 'requirements.lock')
    expect(lock).toMatch(new RegExp(`^harbor==${HARBOR_VERSION.replaceAll('.', '\\.')} `, 'm'))
    expect(DOCKER_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(COMPOSE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe.each([
  ['Dockerfile', dockerfile],
  ['lock.Dockerfile', lockDockerfile],
])('infra/evals/%s', (_name, file) => {
  const stages = new Set([...file.matchAll(/^FROM .+ AS (\S+)$/gm)].map((match) => match[1]))

  it('pins its BuildKit frontend by version and digest', () => {
    expect(file).toMatch(/^# syntax=docker\/dockerfile:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}\n/)
  })

  it('pins every image it is built from by tag and digest, for x86_64', () => {
    const froms = [...file.matchAll(/^FROM (.+)$/gm)].map((match) => match[1] ?? '')
    expect(froms.length).toBeGreaterThan(0)
    const images: string[] = []
    for (const from of froms) {
      const [first, ...rest] = from.split(' ')
      if (first === 'scratch') continue
      const image = first === '--platform=linux/amd64' ? rest[0] : first
      if (image && stages.has(image)) continue
      expect(first, from).toBe('--platform=linux/amd64')
      images.push(image ?? '')
    }
    for (const match of file.matchAll(/--from=(\S+)/g)) {
      if (!stages.has(match[1])) images.push(match[1] ?? '')
    }
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) expect(image).toMatch(/^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/)
  })

  it('checks every file it downloads with ADD by its checksum', () => {
    for (const match of file.matchAll(/^ADD ((?:.*\\\n)*.*)$/gm)) {
      const instruction = match[1] ?? ''
      if (/https?:\/\//.test(instruction))
        expect(instruction).toMatch(/--checksum=sha256:[0-9a-f]{64}/)
    }
  })
})

/**
 * Inside the evals image only (`EVALS_IMAGE=1`, set by infra/evals/Dockerfile): the tools it
 * holds are the pinned ones. Never on a developer's machine or in CI, which do not hold them.
 */
describe.runIf(process.env.EVALS_IMAGE === '1')('the evals image', () => {
  const version = (command: string, args: readonly string[]) =>
    spawnSync(command, args, { encoding: 'utf8' }).stdout ?? ''

  it('holds the pinned agents, pnpm, Harbor and Docker client', () => {
    expect(version('claude', ['--version'])).toContain(AGENT_CLI_VERSIONS['claude-code'])
    expect(version('codex', ['--version'])).toContain(AGENT_CLI_VERSIONS.codex)
    expect(version('pnpm', ['--version']).trim()).toBe(pnpmVersion)
    expect(
      version('/opt/harbor/bin/python', [
        '-c',
        "import importlib.metadata as m; print(m.version('harbor'))",
      ]).trim(),
    ).toBe(HARBOR_VERSION)
    expect(version('harbor', ['--help'])).toContain('Usage')
    expect(version('docker', ['--version'])).toContain(`Docker version ${DOCKER_VERSION},`)
    expect(version('docker', ['compose', 'version'])).toContain(`v${COMPOSE_VERSION}`)
  })

  it('keeps Harbor and LiteLLM from calling home', () => {
    expect(process.env.HARBOR_TELEMETRY).toBe('off')
    expect(process.env.LITELLM_LOCAL_MODEL_COST_MAP).toBe('True')
  })
})

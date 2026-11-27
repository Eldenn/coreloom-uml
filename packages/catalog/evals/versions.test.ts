/**
 * The versions the evals run with, kept equal wherever they are written down (CI, the API's image
 * and its `convention-evals` stage, the per-agent E2B templates and their locks, Harbor's lock),
 * and how what they download is pinned. Offline: nothing here calls a provider.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENT_CLI_PACKAGES, AGENT_CLI_VERSIONS, HARBOR_VERSION } from './src/versions.ts'

const root = join(import.meta.dirname, '../../..')
const infra = join(root, 'infra/evals')
const read = (...path: string[]) => readFileSync(join(...path), 'utf8')
const lockDockerfile = read(infra, 'lock.Dockerfile')
const apiDockerfile = read(root, 'apps/api/Dockerfile')

/** The worker's two stages: `harbor` (Harbor and our classes) and `convention-evals` on it. */
const workerStage = (() => {
  const rest = apiDockerfile.slice(apiDockerfile.search(/^FROM \S+ AS harbor$/m))
  const worker = rest.search(/^FROM harbor AS convention-evals$/m)
  const end = rest.slice(worker + 1).search(/^FROM /m)
  return end === -1 ? rest : rest.slice(0, worker + end + 1)
})()

type Lock = {
  packages: Record<string, { version?: string; integrity?: string; resolved?: string }>
}

/** Each agent's E2B template: its Dockerfile, its manifest and its lock. */
const templates = Object.keys(AGENT_CLI_VERSIONS).map((agent) => {
  const folder = join(infra, 'templates', agent)
  return {
    agent: agent as keyof typeof AGENT_CLI_VERSIONS,
    dockerfile: read(folder, 'Dockerfile'),
    manifest: JSON.parse(read(folder, 'package.json')) as { dependencies: Record<string, string> },
    lock: JSON.parse(read(folder, 'package-lock.json')) as Lock,
  }
})

/** pnpm's version, as the root package.json's `packageManager` names it. */
const pnpmVersion = (
  JSON.parse(read(root, 'package.json')) as { packageManager: string }
).packageManager.replace(/^pnpm@/, '')

describe('the pinned versions', () => {
  const ci = read(root, '.github/workflows/ci.yml')

  it.each(templates)('run $agent at the version CI and its template install', (template) => {
    const name = AGENT_CLI_PACKAGES[template.agent]
    const version = AGENT_CLI_VERSIONS[template.agent]
    expect(ci).toContain(`${name}@${version}`)
    expect(template.manifest.dependencies[name]).toBe(version)
    expect(template.lock.packages[`node_modules/${name}`]?.version).toBe(version)
  })

  it("run Claude Code at the API image's version, in the API and its evals worker", () => {
    const pinned = [...apiDockerfile.matchAll(/@anthropic-ai\/claude-code@(\S+)/g)].map(
      (match) => match[1],
    )
    expect(pinned.length).toBeGreaterThan(1)
    for (const version of pinned) expect(version).toBe(AGENT_CLI_VERSIONS['claude-code'])
    expect(workerStage).toContain(`@anthropic-ai/claude-code@${AGENT_CLI_VERSIONS['claude-code']}`)
  })

  it.each(templates)("give a trial's agent the repository's pnpm ($agent)", (template) => {
    expect(pnpmVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(template.manifest.dependencies.pnpm).toBe(pnpmVersion)
    expect(template.lock.packages['node_modules/pnpm']?.version).toBe(pnpmVersion)
  })

  it.each(
    templates,
  )('install exactly $agent and pnpm, each package by its integrity', (template) => {
    const cli = AGENT_CLI_PACKAGES[template.agent]
    expect(Object.keys(template.manifest.dependencies).sort()).toEqual([cli, 'pnpm'].sort())
    for (const version of Object.values(template.manifest.dependencies))
      expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    const locked = Object.entries(template.lock.packages).filter(([path]) => path !== '')
    expect(locked.length).toBeGreaterThan(0)
    for (const [path, entry] of locked) {
      expect(path === 'node_modules/pnpm' || path.startsWith(`node_modules/${cli}`), path).toBe(
        true,
      )
      expect(entry.integrity).toMatch(/^sha512-/)
      expect(entry.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//)
    }
  })

  it('pin Harbor, with its e2b extra, in its lock and in the worker image', () => {
    expect(HARBOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(read(infra, 'requirements.in').trim()).toBe(`harbor[e2b]==${HARBOR_VERSION}`)
    const lock = read(infra, 'requirements.lock')
    expect(lock).toMatch(new RegExp(`^harbor==${HARBOR_VERSION.replaceAll('.', '\\.')} `, 'm'))
    expect(lock).toMatch(/^e2b==\d+\.\d+\.\d+ /m)
    expect(workerStage).toContain(`ARG HARBOR_VERSION=${HARBOR_VERSION}\n`)
    // The stage checks Harbor's version with its own build argument, expanded by the shell.
    expect(workerStage).toContain(`m.version('harbor') == '\${HARBOR_VERSION}'`)
  })
})

describe('the convention-evals stage of apps/api/Dockerfile', () => {
  it('installs Harbor from its lock by hash, from wheels only, with uv pinned by digest', () => {
    // By tag only, like the API's other Debian stage (`skill-tagger`): the API's images pin
    // their Node base by version, not digest; the E2B templates pin theirs by digest.
    expect(workerStage).toMatch(/^FROM node:\S+-slim AS harbor$/m)
    expect(workerStage).toMatch(/^FROM harbor AS convention-evals$/m)
    expect(workerStage).toContain('--require-hashes --no-build')
    expect(workerStage).toContain('-r /opt/harbor-requirements.lock')
    expect(workerStage).toMatch(/--from=ghcr\.io\/astral-sh\/uv:[\w.-]+@sha256:[0-9a-f]{64} /)
    expect(workerStage).toContain('COPY infra/evals/coreloom_harbor ')
  })

  it('holds no Docker client, Compose or daemon, and runs only its queue, as node', () => {
    expect(workerStage).not.toMatch(/docker|compose/i)
    expect(workerStage).toMatch(/^USER node$/m)
    expect(workerStage).toContain('"queue:work", "--queues=convention-evals"]')
  })

  it('keeps Harbor and LiteLLM from calling home', () => {
    expect(workerStage).toContain('HARBOR_TELEMETRY=off')
    expect(workerStage).toContain('LITELLM_LOCAL_MODEL_COST_MAP=True')
  })
})

describe('the other workers', () => {
  /** The block of a compose service, up to the next service. */
  const service = (compose: string, name: string) => {
    const block = compose.slice(compose.indexOf(`\n  ${name}:\n`) + 1)
    const end = block.slice(1).search(/\n {2}[a-z][\w-]*:\n/)
    return end === -1 ? block : block.slice(0, end + 1)
  }

  it('never listen to the convention-evals queue', () => {
    const { scripts } = JSON.parse(read(root, 'apps/api/package.json')) as {
      scripts: Record<string, string>
    }
    for (const [name, script] of Object.entries(scripts)) {
      // `queue:evals` is the convention-evals worker itself, outside Docker.
      if (name === 'queue:evals') {
        expect(script).toMatch(/queue:work --queues=convention-evals$/)
        continue
      }
      expect(script, name).not.toContain('--queues=convention-evals')
    }
    for (const file of ['docker-compose.staging.yml', 'docker-compose.production.yml']) {
      const compose = read(root, 'infra', file)
      for (const name of ['queue-worker', 'skill-scanner', 'skill-tagger']) {
        expect(service(compose, name), `${file} ${name}`).not.toContain('--queues=convention-evals')
      }
      expect(service(compose, 'convention-evals')).toMatch(
        /target: convention-evals|coreloom-uml-convention-evals:/,
      )
    }
  })
})

describe.each([
  ...templates.map((template) => [`templates/${template.agent}/Dockerfile`, template.dockerfile]),
  ['lock.Dockerfile', lockDockerfile],
])('infra/evals/%s', (_name, file) => {
  const stages = new Set([...file.matchAll(/^FROM .+ AS (\S+)$/gm)].map((match) => match[1]))

  it('pins every image it is built from by tag and digest', () => {
    const froms = [...file.matchAll(/^FROM (.+)$/gm)].map((match) => match[1] ?? '')
    expect(froms.length).toBeGreaterThan(0)
    const images: string[] = []
    for (const from of froms) {
      const [first, ...rest] = from.split(' ')
      if (first === 'scratch') continue
      const image = first?.startsWith('--platform=') ? rest[0] : first
      if (image && stages.has(image)) continue
      images.push(image ?? '')
    }
    for (const match of file.matchAll(/--from=(\S+)/g)) {
      if (!stages.has(match[1])) images.push(match[1] ?? '')
    }
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) expect(image).toMatch(/^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/)
  })

  it('downloads nothing with ADD', () => {
    expect(file).not.toMatch(/^ADD /m)
  })
})

describe.each(templates)('the $agent template', (template) => {
  it('is one stage (E2B builds no other) and installs from its lock with no script run', () => {
    expect([...template.dockerfile.matchAll(/^FROM /gm)]).toHaveLength(1)
    expect(template.dockerfile).toContain('npm ci --ignore-scripts')
    expect(template.dockerfile).not.toMatch(/npm (install|i) /)
  })

  it('takes no build argument or environment variable, so nothing can name a credential', () => {
    expect(template.dockerfile).not.toMatch(/^(ARG|ENV) /m)
  })

  it('pins its Debian packages', () => {
    expect(template.dockerfile).toMatch(/git=\S+ /)
    expect(template.dockerfile).toMatch(/ca-certificates=\S+/)
    // tune2fs, which our environment class runs at setup (record section 13).
    expect(template.dockerfile).toMatch(/e2fsprogs=\S+/)
  })
})

it('lock.Dockerfile pins its BuildKit frontend by version and digest', () => {
  expect(lockDockerfile).toMatch(/^# syntax=docker\/dockerfile:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}\n/)
})

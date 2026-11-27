/**
 * The versions the evals run with, kept equal wherever they are written down (CI, the API's image,
 * the evals image and its lock), and, inside the evals image only, the tools it really holds.
 * Offline: nothing here calls a provider.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENT_CLI_PACKAGES, AGENT_CLI_VERSIONS, HARBOR_VERSION } from './src/versions.ts'

describe('the pinned versions', () => {
  const ci = readFileSync(join(import.meta.dirname, '../../../.github/workflows/ci.yml'), 'utf8')

  it.each(
    Object.entries(AGENT_CLI_VERSIONS),
  )('run %s at the version CI installs', (target, version) => {
    const name = AGENT_CLI_PACKAGES[target as keyof typeof AGENT_CLI_PACKAGES]
    expect(ci).toContain(`${name}@${version}`)
  })

  it('pin Harbor to an exact version', () => {
    expect(HARBOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  const infra = join(import.meta.dirname, '../../../infra/evals')
  const dockerfile = readFileSync(join(infra, 'Dockerfile'), 'utf8')

  it('are the ones the evals image is built with', () => {
    expect(dockerfile).toContain(`ARG HARBOR_VERSION=${HARBOR_VERSION}\n`)
    expect(dockerfile).toContain(`ARG CLAUDE_CODE_VERSION=${AGENT_CLI_VERSIONS['claude-code']}\n`)
    expect(dockerfile).toContain(`ARG CODEX_VERSION=${AGENT_CLI_VERSIONS.codex}\n`)
    const lock = readFileSync(join(infra, 'requirements.lock'), 'utf8')
    expect(lock).toMatch(new RegExp(`^harbor==${HARBOR_VERSION.replaceAll('.', '\\.')} `, 'm'))
  })

  it('pin every base image of the evals image by tag and digest', () => {
    const images = [
      ...dockerfile.matchAll(/^FROM (\S+)/gm),
      ...dockerfile.matchAll(/--from=(\S+)/g),
    ]
      .map((match) => match[1] ?? '')
      .filter((image) => image !== 'agent')
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) expect(image).toMatch(/^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/)
  })
})

/**
 * Inside the evals image only (`EVALS_IMAGE=1`, set by infra/evals/Dockerfile): the tools it
 * holds are the pinned ones. Never on a developer's machine or in CI, which do not hold them.
 */
describe.runIf(process.env.EVALS_IMAGE === '1')('the evals image', () => {
  const version = (command: string, args: readonly string[]) =>
    spawnSync(command, args, { encoding: 'utf8' }).stdout ?? ''
  const dockerfile = readFileSync(
    join(import.meta.dirname, '../../../infra/evals/Dockerfile'),
    'utf8',
  )
  const arg = (name: string) => dockerfile.match(new RegExp(`^ARG ${name}=(\\S+)$`, 'm'))?.[1]

  it('holds the pinned agents, Harbor and Docker client', () => {
    expect(version('claude', ['--version'])).toContain(AGENT_CLI_VERSIONS['claude-code'])
    expect(version('codex', ['--version'])).toContain(AGENT_CLI_VERSIONS.codex)
    expect(
      version('/opt/harbor/bin/python', [
        '-c',
        "import importlib.metadata as m; print(m.version('harbor'))",
      ]).trim(),
    ).toBe(HARBOR_VERSION)
    expect(version('harbor', ['--help'])).toContain('Usage')
    expect(version('docker', ['--version'])).toContain(arg('DOCKER_VERSION'))
    expect(version('docker', ['compose', 'version'])).toContain(arg('COMPOSE_VERSION'))
  })
})

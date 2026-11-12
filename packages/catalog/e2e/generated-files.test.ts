/**
 * Loads the settings files the catalog renders into the tools they are written for, offline: no
 * account, no key, no model call. Run with `pnpm test:e2e` (the unit suite stays in `src`).
 *
 * What only a live session could show is not covered: which commands a Claude Code permission
 * rule matches and that a `Stop` hook's stderr goes back to the model (Claude Code documents no
 * offline evaluator: `claude doctor` only says whether it accepts the rules), that Gemini CLI
 * skips the confirmation for an allowed command, and how Codex splits a `bash -lc` script before
 * it checks each command.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ajv } from 'ajv'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { afterAll, describe, expect, it } from 'vitest'
import { findQuestionnaire, type Questionnaire, renderAgentContext } from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const bin = (name: string) => join(here, '../node_modules/.bin', name)
const schema = (name: string) => JSON.parse(readFileSync(join(here, 'schemas', name), 'utf8'))

// `realpath`: Codex names a trusted project by its resolved path.
const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-e2e-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const frontendReact = findQuestionnaire('frontend-react') as Questionnaire

/** Renders for every tool with settings and writes the files into a new folder. */
function project(name: string, autonomy: number): string {
  const answer = (questionId: string, value: number | string) => ({
    questionnaireId: frontendReact.id,
    questionId,
    value,
  })
  const { files } = renderAgentContext({
    project: {
      name: 'Shop',
      description: null,
      architectures: [
        {
          title: 'Layers',
          description: null,
          diagrams: [
            {
              kind: 'package',
              title: 'Layers',
              packages: {
                elements: ['src/ui', 'src/domain', 'src/infra'].map((id) => ({
                  id,
                  kind: 'package',
                })),
                relations: [
                  { from: 'src/ui', to: 'src/domain' },
                  { from: 'src/infra', to: 'src/domain' },
                ],
              },
            },
          ],
        },
      ],
    },
    questionnaires: [frontendReact],
    answers: [
      answer('ask-before-act', autonomy),
      answer('package-manager', 'pnpm'),
      answer('checks', 'pnpm lint && pnpm test'),
    ],
    rules: [],
    notes: null,
    targets: ['claude-code', 'codex', 'gemini-cli'],
  })
  const root = join(tmp, name)
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true })
    writeFileSync(join(root, file.path), file.content)
  }
  execFileSync('git', ['init', '--quiet', root])
  return root
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')

/** The assistant works alone in its sandbox and may run the checks. */
const autonomous = project('autonomous', 3)
/** The assistant asks before anything: read-only sandbox, no check allowed. */
const asksFirst = project('asks-first', 5)

describe('Codex', () => {
  const RULES = '.codex/rules/coreloom-uml.rules'
  const codexHome = join(tmp, 'codex-home')
  mkdirSync(codexHome)
  const trust = (...roots: string[]) =>
    writeFileSync(
      join(codexHome, 'config.toml'),
      roots.map((root) => `[projects.${JSON.stringify(root)}]\ntrust_level = "trusted"\n`).join(''),
    )
  const codex = (cwd: string, ...args: string[]) =>
    execFileSync(bin('codex'), args, {
      cwd,
      env: { ...process.env, CODEX_HOME: codexHome },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

  /** Codex's own evaluator; it refuses a file whose `match`/`not_match` examples do not hold. */
  const decision = (root: string, command: string): string | undefined =>
    JSON.parse(
      codex(root, 'execpolicy', 'check', '--rules', join(root, RULES), ...command.split(' ')),
    ).decision

  it.each([
    ['git push --force', 'forbidden'],
    ['git push -f origin main', 'forbidden'],
    ['rm -rf build', 'forbidden'],
    ['rm -fr build', 'forbidden'],
    ['npm install', 'forbidden'],
    ['yarn add left-pad', 'forbidden'],
    ['bun install', 'forbidden'],
    ['pnpm lint', 'allow'],
    ['pnpm test', 'allow'],
    ['pnpm install', undefined],
    ['git push origin main', undefined],
    // Known gaps of a prefix rule, which the recommendation states. Asserted so that a Codex
    // that starts catching them is noticed, and the wording updated.
    ['git push origin main --force', undefined],
    ['rm -r -f build', undefined],
    ['sudo npm install', undefined],
  ])('decides `%s`: %s', (command, expected) => {
    expect(decision(autonomous, command)).toBe(expected)
  })

  it('allows no check when the assistant must ask first, and still forbids', () => {
    expect(decision(asksFirst, 'pnpm lint')).toBeUndefined()
    expect(decision(asksFirst, 'git push --force')).toBe('forbidden')
  })

  it('refuses a rules file whose example does not hold', () => {
    const broken = join(tmp, 'broken.rules')
    writeFileSync(broken, read(autonomous, RULES).replace('"git push --force"', '"git status"'))
    expect(() => codex(tmp, 'execpolicy', 'check', '--rules', broken, 'ls')).toThrow(
      /expected every example to match/,
    )
  })

  /** What Codex would send the model: it states the sandbox and the allowed prefixes in force. */
  const promptInput = (root: string) => codex(root, 'debug', 'prompt-input', 'hello')
  const SANDBOX = /`sandbox_mode` is `([a-z-]+)`/
  const ALLOWED = String.raw`[\"pnpm\", \"lint\"]`

  it('loads the config and the rules of a trusted project', { timeout: 60_000 }, () => {
    trust(autonomous, asksFirst)
    const prompt = promptInput(autonomous)
    expect(prompt.match(SANDBOX)?.[1]).toBe('workspace-write')
    expect(prompt).toContain(ALLOWED)
    // Read-only is not what a trusted project gets by default, so it comes from the file.
    expect(promptInput(asksFirst).match(SANDBOX)?.[1]).toBe('read-only')
    expect(promptInput(asksFirst)).not.toContain(ALLOWED)
  })

  it('refuses a config with a value it does not know', () => {
    const root = project('unknown-policy', 3)
    trust(root)
    const path = join(root, '.codex/config.toml')
    writeFileSync(path, readFileSync(path, 'utf8').replace('"on-request"', '"sometimes"'))
    expect(() => promptInput(root)).toThrow(/unknown variant `sometimes`/)
  })

  it('ignores both files until the project is trusted', { timeout: 60_000 }, () => {
    trust()
    const prompt = promptInput(autonomous)
    expect(prompt.match(SANDBOX)?.[1]).toBe('read-only')
    expect(prompt).not.toContain(ALLOWED)
  })
})

describe('Claude Code', () => {
  const settings = JSON.parse(read(autonomous, '.claude/settings.json'))

  // Vendored from SchemaStore, commit bf7c6745505ccace5568dc0d7f4ae29647e9b41a (2026-10-19):
  // https://github.com/SchemaStore/schemastore/blob/bf7c6745505ccace5568dc0d7f4ae29647e9b41a/src/schemas/json/claude-code-settings.json
  const validate = new Ajv({ strict: false, formats: { uri: true } }).compile(
    schema('claude-code-settings.schema.json'),
  )

  it('renders settings the published schema accepts', () => {
    expect(validate(settings), JSON.stringify(validate.errors)).toBe(true)
    expect(validate(JSON.parse(read(asksFirst, '.claude/settings.json')))).toBe(true)
    // The schema does check what the settings hold.
    expect(validate({ permissions: { deny: ['Shell(rm -rf *)'] } })).toBe(false)
    expect(validate({ hooks: { Stop: [{ hooks: [{ type: 'command' }] }] } })).toBe(false)
  })

  describe('doctor', () => {
    const configDir = join(tmp, 'claude-config')
    mkdirSync(configDir)
    const trust = (...roots: string[]) =>
      writeFileSync(
        join(configDir, '.claude.json'),
        JSON.stringify({
          projects: Object.fromEntries(
            roots.map((root) => [root, { hasTrustDialogAccepted: true }]),
          ),
        }),
      )
    /**
     * `claude doctor` reads the settings as a session would and reports what it refuses, without
     * signing in. The package's wrapper is run with Node: its install script is not allowed.
     */
    const doctor = (root: string) =>
      spawnSync(
        process.execPath,
        [join(here, '../node_modules/@anthropic-ai/claude-code/cli-wrapper.cjs'), 'doctor'],
        {
          cwd: root,
          env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, DISABLE_AUTOUPDATER: '1' },
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
    const PROBLEMS = /Invalid settings|may not work as written/
    const UNTRUSTED = /Ignoring 2 permissions\.allow entries from \.claude\/settings\.json/

    it('accepts every rule and the hook, and allows the checks only once trusted', {
      timeout: 60_000,
    }, () => {
      trust()
      const untrusted = doctor(autonomous)
      expect(untrusted.stdout).toContain('Claude Code doctor')
      expect(untrusted.stdout + untrusted.stderr).not.toMatch(PROBLEMS)
      expect(untrusted.stdout + untrusted.stderr).toMatch(UNTRUSTED)

      trust(autonomous)
      const trusted = doctor(autonomous)
      expect(trusted.stdout).toContain('Claude Code doctor')
      expect(trusted.stdout + trusted.stderr).not.toMatch(PROBLEMS)
      expect(trusted.stdout + trusted.stderr).not.toMatch(/Ignoring/)
    })

    it('reports a rule it cannot read', () => {
      const root = project('broken-rule', 3)
      const path = join(root, '.claude/settings.json')
      writeFileSync(path, readFileSync(path, 'utf8').replace('Bash(rm -rf *)', 'Bash(rm -rf *'))
      const { stdout, stderr } = doctor(root)
      expect(stdout + stderr).toMatch(
        /Invalid settings[\s\S]*Invalid permission rule "Bash\(rm -rf \*"/,
      )
    })
  })

  describe('Stop hook', () => {
    const fakeBin = join(tmp, 'bin')
    mkdirSync(fakeBin)
    // A package manager whose `$FAIL` script fails.
    writeFileSync(
      join(fakeBin, 'pnpm'),
      '#!/bin/sh\necho "pnpm $1 in $(pwd)"\n[ "$1" != "$FAIL" ]\n',
    )
    chmodSync(join(fakeBin, 'pnpm'), 0o755)
    mkdirSync(join(autonomous, 'src'), { recursive: true })

    /** As Claude Code runs it: `sh -c`, in the current directory, which may be a subfolder. */
    const stop = (fail: string) =>
      spawnSync('sh', ['-c', settings.hooks.Stop[0].hooks[0].command], {
        cwd: join(autonomous, 'src'),
        env: {
          PATH: `${fakeBin}:${process.env.PATH}`,
          CLAUDE_PROJECT_DIR: autonomous,
          FAIL: fail,
        },
        encoding: 'utf8',
      })

    it('exits 0 when every check passes, from the project root', () => {
      const { status, stdout, stderr } = stop('')
      expect({ status, stdout }).toEqual({ status: 0, stdout: '' })
      expect(stderr).toBe(`pnpm lint in ${autonomous}\npnpm test in ${autonomous}\n`)
    })

    it('exits 2 with the output on stderr when a check fails', () => {
      const { status, stdout, stderr } = stop('test')
      expect({ status, stdout }).toEqual({ status: 2, stdout: '' })
      expect(stderr).toContain('pnpm test in')
    })

    it('stops at the first check that fails', () => {
      const { status, stderr } = stop('lint')
      expect(status).toBe(2)
      expect(stderr).not.toContain('pnpm test')
    })
  })
})

describe('Gemini CLI', () => {
  // Vendored from Gemini CLI, commit 62bab5b232c15b925d31e655ce844ab939c882b7 (2026-11-06):
  // https://github.com/google-gemini/gemini-cli/blob/62bab5b232c15b925d31e655ce844ab939c882b7/schemas/settings.schema.json
  const validate = new Ajv2020({ strict: false }).compile(schema('gemini-cli-settings.schema.json'))

  it('renders settings the published schema accepts', () => {
    const settings = JSON.parse(read(autonomous, '.gemini/settings.json'))
    expect(validate(settings), JSON.stringify(validate.errors)).toBe(true)
    expect(settings.tools.allowed).toEqual([
      'run_shell_command(pnpm lint)',
      'run_shell_command(pnpm test)',
    ])
    expect(validate({ tools: { allowed: 'run_shell_command(pnpm lint)' } })).toBe(false)
    expect(validate({ tool: {} })).toBe(false)
  })
})

describe('dependency-cruiser', () => {
  const root = project('layers', 3)
  const source = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  source('src/domain/order.js', 'export const order = 1\n')
  source('src/ui/page.js', "export { order } from '../domain/order.js'\n")
  source('src/infra/store.js', "export { order } from '../domain/order.js'\n")

  /** The command the config and AGENTS.md give, which names no config file. */
  const depcruise = () => {
    const command = /Check them with: npx depcruise (.+)/.exec(
      read(root, '.dependency-cruiser.cjs'),
    )
    return spawnSync(bin('depcruise'), command?.[1]?.split(' ') ?? [], {
      cwd: root,
      encoding: 'utf8',
    })
  }

  it('passes on the dependencies the diagram draws', () => {
    const { status, stdout } = depcruise()
    expect(stdout).toContain('no dependency violations found')
    expect(status).toBe(0)
  })

  it('fails on a dependency the diagram does not draw', () => {
    source('src/domain/leak.js', "export { order } from '../ui/page.js'\n")
    const { status, stdout } = depcruise()
    expect(stdout).toContain('not-in-diagram:src/domain: src/domain/leak.js → src/ui/page.js')
    expect(status).toBe(1)
  })
})

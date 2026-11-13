/**
 * Loads the settings files the catalog renders into the tools they are written for, offline: no
 * account, no key, no model call. Run with `pnpm test:e2e` (the unit suite stays in `src`).
 *
 * Codex and Claude Code are not dependencies: they are found on `PATH`, or through `CODEX_BIN`
 * and `CLAUDE_BIN`. Without one, its cases are skipped locally and fail in CI, which installs both.
 *
 * What only a live session could show is not covered: which commands a Claude Code permission
 * rule matches and that a `Stop` hook's stderr goes back to the model (Claude Code documents no
 * offline evaluator: `claude doctor` only says whether it accepts the rules), that Gemini CLI
 * skips the confirmation for an allowed command, and how Codex splits a `bash -lc` script before
 * it checks each command. For the gates, GitHub Actions itself is not run: the workflow is read
 * as YAML and its key-detection script run with `bash -e`, as a runner would, and the secret scan
 * is not downloaded. For the development container, Docker is not run: `devcontainer.json` is
 * read as JSON and the firewall script only parsed by bash, so that it blocks and lets through
 * what it says is checked by hand, by starting the container (see `src/render/sandbox.ts`).
 * For the roles, no session is started: that Codex acts as the agent file it is asked to read,
 * that it gets no web search with `web_search=disabled` (`codex debug prompt-input` does not print
 * that tool) and that a `claude --agent` session has only the tools its file lists are not
 * covered. Neither tool has a command that reports a role file it refuses (`claude doctor` and
 * `claude agents` do not read them): both drop it from the roles they list, which is what is read.
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
import { parse as parseYaml } from 'yaml'
import {
  type AgentContextFile,
  findQuestionnaire,
  type Questionnaire,
  type Role,
  renderAgentContext,
} from '../src/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const bin = (name: string) => join(here, '../node_modules/.bin', name)
/**
 * A tool this suite does not install: its command, or `null` when it is missing, which CI refuses
 * so that these cases cannot stop running unnoticed.
 */
function tool(name: string, variable: string, npmPackage: string): string | null {
  const command = process.env[variable] || name
  if (spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0) return command
  const message = `\`${command}\` not found: install it with \`npm install --global ${npmPackage}\`, or set ${variable} to its path.`
  if (process.env.CI) throw new Error(message)
  process.stderr.write(`Skipping the ${name} cases: ${message}\n`)
  return null
}

// The versions the CI job installs (`.github/workflows/ci.yml`).
const CODEX = tool('codex', 'CODEX_BIN', '@openai/codex@0.167.2')
const CLAUDE = tool('claude', 'CLAUDE_BIN', '@anthropic-ai/claude-code@2.1.322')

const schema = (name: string) => JSON.parse(readFileSync(join(here, 'schemas', name), 'utf8'))

// `realpath`: Codex names a trusted project by its resolved path.
const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-e2e-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const frontendReact = findQuestionnaire('frontend-react') as Questionnaire

/** Renders for every tool with settings. */
function render(autonomy: number, roles: Role[] = []) {
  const answer = (questionId: string, value: number | string) => ({
    questionnaireId: frontendReact.id,
    questionId,
    value,
  })
  return renderAgentContext({
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
    roles,
  })
}

/** Writes rendered files into a new folder, a Git repository. */
function write(name: string, files: AgentContextFile[]): string {
  const root = join(tmp, name)
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true })
    writeFileSync(join(root, file.path), file.content)
  }
  execFileSync('git', ['init', '--quiet', root])
  return root
}

const project = (name: string, autonomy: number) => write(name, render(autonomy).files)

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8')

/** Replaces text in a written file, which must hold it. */
function corrupt(root: string, path: string, from: string, to: string) {
  expect(read(root, path)).toContain(from)
  writeFileSync(join(root, path), read(root, path).replace(from, to))
}

/** The assistant works alone in its sandbox and may run the checks. */
const autonomous = project('autonomous', 3)
/** The assistant asks before anything: read-only sandbox, no check allowed. */
const asksFirst = project('asks-first', 5)

/** Text a TOML or YAML string must escape, and text it must not. */
const DESCRIPTION = 'Reviews a "change": never writes, é \\ ✓.'
const role = (slug: string, rights: Role['rights']): Role => ({
  slug,
  name: 'Reviewer',
  description: DESCRIPTION,
  mission: 'Review the change.\n\nQuote """three""" and a back\\slash, then a café ✓.',
  rights,
  scope: [],
  forbidden: [],
  done: { commands: [], text: 'The review is posted.' },
  escalation: null,
  source: null,
})
/** In a project whose own settings let the assistant write. */
const staffed = render(3, [
  role('reviewer', ['read']),
  role('code-checker', ['read', 'run-checks']),
])
const withRoles = write('roles', staffed.files)
const withBrokenRole = write('broken-role', staffed.files)

describe.skipIf(CODEX === null)('Codex', () => {
  const RULES = '.codex/rules/coreloom-uml.rules'
  const codexHome = join(tmp, 'codex-home')
  mkdirSync(codexHome)
  const trust = (...roots: string[]) =>
    writeFileSync(
      join(codexHome, 'config.toml'),
      roots.map((root) => `[projects.${JSON.stringify(root)}]\ntrust_level = "trusted"\n`).join(''),
    )
  const codex = (cwd: string, ...args: string[]) =>
    execFileSync(CODEX as string, args, {
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

  describe('roles', () => {
    /** A role as Codex offers it to spawn: its name and description, read from its file. */
    const offered = (slug: string) => `${slug}: {\\n${JSON.stringify(DESCRIPTION).slice(1, -1)}\\n}`
    /** The options of the rendered launch command, without the prompt that ends it. */
    const launchOptions = (slug: string) => {
      const launch = staffed.roles.find((item) => item.target === 'codex' && item.slug === slug)
      return /^codex (.+?) "/.exec(launch?.launch ?? '')?.[1]?.split(' ') ?? []
    }

    it('starts read-only with the launch command, whatever the project config', {
      timeout: 60_000,
    }, () => {
      trust(withRoles)
      expect(promptInput(withRoles).match(SANDBOX)?.[1]).toBe('workspace-write')
      const options = launchOptions('reviewer')
      expect(options).toEqual(['--sandbox', 'read-only', '-c', 'web_search=disabled'])
      // Codex refuses an option or a value it does not know, so the command is one it takes.
      const prompt = codex(withRoles, ...options, 'debug', 'prompt-input', 'hello')
      expect(prompt.match(SANDBOX)?.[1]).toBe('read-only')
      expect(() =>
        codex(withRoles, '-c', 'web_search=sometimes', 'debug', 'prompt-input', 'hello'),
      ).toThrow(/unknown variant `sometimes`/)
    })

    it('reads each agent file, and leaves out one it cannot read', { timeout: 60_000 }, () => {
      trust(withRoles, withBrokenRole)
      const prompt = promptInput(withRoles)
      expect(prompt).toContain(offered('reviewer'))
      // A name with a hyphen, which the documentation does not show.
      expect(prompt).toContain(offered('code-checker'))

      // Codex reports nothing: a file that is not TOML it can read is no role, without a word.
      corrupt(
        withBrokenRole,
        '.codex/agents/reviewer.toml',
        'developer_instructions = "',
        'developer_instructions = "\\q',
      )
      const broken = promptInput(withBrokenRole)
      expect(broken).not.toContain('reviewer: {')
      expect(broken).toContain(offered('code-checker'))
    })
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

  describe.skipIf(CLAUDE === null)('doctor', () => {
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
     * signing in.
     */
    const doctor = (root: string) =>
      spawnSync(CLAUDE as string, ['doctor'], {
        cwd: root,
        env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, DISABLE_AUTOUPDATER: '1' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
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

  describe('roles', () => {
    const AGENT = '.claude/agents/reviewer.md'
    const frontmatter = (root: string, path: string) =>
      parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(read(root, path))?.[1] ?? '')

    it('renders agent files whose frontmatter is YAML', () => {
      expect(frontmatter(withRoles, AGENT)).toEqual({
        name: 'reviewer',
        description: DESCRIPTION,
        tools: 'Read, Grep, Glob',
      })
      expect(frontmatter(withRoles, '.claude/agents/code-checker.md')).toEqual({
        name: 'code-checker',
        description: DESCRIPTION,
        tools: 'Read, Grep, Glob, Bash',
        permissionMode: 'dontAsk',
      })
    })

    describe.skipIf(CLAUDE === null)('claude --agent', () => {
      const home = join(tmp, 'claude-roles-home')
      mkdirSync(home)
      /**
       * The agents a session could start as. `claude --agent` names them when asked for one that
       * does not exist, before it looks for an account; none is given to it here, nor any
       * variable that holds a key, so it could not call a model if that order changed.
       */
      const agents = (root: string) => {
        const { stdout, stderr } = spawnSync(
          CLAUDE as string,
          ['--print', '--agent', 'no-such-agent', 'hello'],
          {
            cwd: root,
            env: {
              PATH: process.env.PATH,
              HOME: home,
              CLAUDE_CONFIG_DIR: home,
              DISABLE_AUTOUPDATER: '1',
            },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        return /'no-such-agent' not found\. Available agents: (.+)/
          .exec(stdout + stderr)?.[1]
          ?.split(', ')
      }

      it('loads each agent file, and leaves out one it cannot read', { timeout: 60_000 }, () => {
        expect(agents(withRoles)).toEqual(expect.arrayContaining(['reviewer', 'code-checker']))

        // Claude Code reports nothing either: a description it cannot read is no agent.
        corrupt(withBrokenRole, AGENT, 'description: "', 'description: "\\q')
        const left = agents(withBrokenRole)
        expect(left).toContain('code-checker')
        expect(left).not.toContain('reviewer')
      })
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

describe('Gates', () => {
  const HOOK_SHEBANG = '#!/bin/sh\n'
  const WORKFLOW = '.github/workflows/agent-conventions.yml'

  /** Renders the hooks and the workflow, and writes them as the CLI does, in a Git repository. */
  const gated = (name: string, answers: [string, string, number | string | string[]][]) => {
    const { files } = renderAgentContext({
      project: { name: 'Shop', description: null, architectures: [] },
      questionnaires: ['frontend-react', 'git-workflow', 'security'].map(
        (id) => findQuestionnaire(id) as Questionnaire,
      ),
      answers: answers.map(([questionnaireId, questionId, value]) => ({
        questionnaireId,
        questionId,
        value,
      })),
      rules: [],
      notes: null,
      targets: [],
      roles: [],
    })
    const root = join(tmp, name)
    for (const file of files) {
      const hook = file.path.startsWith('.githooks/')
      mkdirSync(dirname(join(root, file.path)), { recursive: true })
      writeFileSync(join(root, file.path), `${hook ? HOOK_SHEBANG : ''}${file.content}`)
      if (hook) chmodSync(join(root, file.path), 0o755)
    }
    execFileSync('git', ['init', '--quiet', root])
    // What the recommendation asks the owner to run.
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root })
    return root
  }

  const root = gated('gates', [
    ['frontend-react', 'package-manager', 'pnpm'],
    ['frontend-react', 'checks', 'pnpm lint && pnpm test: unit'],
    ['git-workflow', 'commit-messages', 'conventional'],
    ['git-workflow', 'attribution', 5],
    ['git-workflow', 'ci-workflow', 'github-actions'],
    ['security', 'secrets', 5],
  ])

  const fakeBin = join(tmp, 'gates-bin')
  mkdirSync(fakeBin)
  // A package manager whose `$FAIL` script fails.
  writeFileSync(join(fakeBin, 'pnpm'), '#!/bin/sh\necho "pnpm $*"\n[ "$1" != "$FAIL" ]\n')
  chmodSync(join(fakeBin, 'pnpm'), 0o755)

  /** A real commit, with nobody's own Git configuration: both hooks run, as for any author. */
  const commit = (message: string, fail = '') =>
    spawnSync('git', ['commit', '--allow-empty', '--message', message], {
      cwd: root,
      env: {
        PATH: `${fakeBin}:${process.env.PATH}`,
        FAIL: fail,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'Ada',
        GIT_AUTHOR_EMAIL: 'ada@example.com',
        GIT_COMMITTER_NAME: 'Ada',
        GIT_COMMITTER_EMAIL: 'ada@example.com',
      },
      encoding: 'utf8',
    })
  const commits = () =>
    Number(execFileSync('git', ['rev-list', '--count', '--all'], { cwd: root, encoding: 'utf8' }))

  it.each(['pre-commit', 'commit-msg'])('renders a %s hook the shell accepts', (hook) => {
    const { status, stderr } = spawnSync('sh', ['-n', join(root, '.githooks', hook)], {
      encoding: 'utf8',
    })
    expect({ status, stderr }).toEqual({ status: 0, stderr: '' })
  })

  it('lets a commit through when the checks pass and the message fits', () => {
    const { status, stderr } = commit('feat(shop): add the basket\n\nBecause.')
    // Every check ran, in order, with its arguments kept whole. Git sends a hook's output to
    // its own stderr.
    expect(stderr).toBe('pnpm lint\npnpm test: unit\n')
    expect(status).toBe(0)
    expect(commits()).toBe(1)
  })

  it('refuses the commit at the first check that fails', () => {
    const { status, stderr } = commit('feat: never committed', 'lint')
    expect(status).toBe(1)
    expect(stderr).toBe('pnpm lint\n')
    expect(commit('feat: never committed', 'test:').status).toBe(1)
    expect(commits()).toBe(1)
  })

  it('refuses a subject that is not a Conventional Commit', () => {
    const { status, stderr } = commit('Add the basket')
    expect(status).toBe(1)
    expect(stderr).toContain('commit-msg: the subject must follow Conventional Commits')
    expect(commits()).toBe(1)
  })

  it('refuses a message that credits an assistant, and lets a person be credited', () => {
    const refused = commit('fix: round the total\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('must not credit a coding assistant')
    expect(commits()).toBe(1)

    const person = 'fix: round the total\n\nCo-authored-by: Claude Dupont <claude@example.com>'
    expect(commit(person).status).toBe(0)
    expect(commits()).toBe(2)
  })

  it('renders no commit-msg hook and no workflow when no answer asks for one', () => {
    const plain = gated('gates-plain', [
      ['frontend-react', 'checks', 'pnpm lint'],
      ['git-workflow', 'commit-messages', 'imperative'],
      ['git-workflow', 'attribution', 3],
    ])
    const tracked = execFileSync('git', ['ls-files', '--others'], { cwd: plain, encoding: 'utf8' })
    expect(tracked.trim().split('\n')).toEqual(['.githooks/pre-commit', 'AGENTS.md'])
  })

  describe('workflow', () => {
    type Step = {
      id?: string
      name?: string
      if?: string
      uses?: string
      run?: string
      env?: Record<string, string>
    }
    const workflow = parseYaml(read(root, WORKFLOW))
    const job = workflow.jobs['agent-conventions']
    const steps: Step[] = job.steps
    const step = (name: string) => steps.findIndex((item) => item.name === name)

    it('is YAML a runner can read, started by pull requests and pushes', () => {
      expect(Object.keys(workflow.on)).toEqual(['pull_request', 'push'])
      expect(workflow.permissions).toEqual({ contents: 'read' })
      expect(job['runs-on']).toBe('ubuntu-24.04')
      for (const item of steps) expect(typeof (item.uses ?? item.run)).toBe('string')
    })

    it('pins every action by a full commit', () => {
      const uses = steps.flatMap((item) => (item.uses ? [item.uses] : []))
      expect(uses.map((action) => action.split('@')[0])).toEqual([
        'actions/checkout',
        'actions/setup-node',
      ])
      for (const action of uses) expect(action).toMatch(/^[\w-]+\/[\w-]+@[0-9a-f]{40}$/)
    })

    it('runs each check as it was answered, after the install', () => {
      const runs = steps.flatMap((item) => (item.run && !item.name ? [item.run] : []))
      expect(runs).toEqual([
        'corepack enable',
        'pnpm install --frozen-lockfile',
        'pnpm lint',
        'pnpm test: unit',
      ])
    })

    it('gives the key to the detection and check steps only, and guards the check', () => {
      const [detect, check] = [step('Look for the API key'), step('Check the agent conventions')]
      expect(detect).toBeGreaterThan(-1)
      expect(check).toBe(detect + 1)
      expect(steps[detect]?.id).toBe('key')
      expect(steps[check]?.if).toBe("steps.key.outputs.present == 'true'")
      expect(steps[check]?.run).toMatch(/^npx @coreloom-uml\/cli@\d+\.\d+\.\d+ check$/)
      expect(job.env).toBeUndefined()
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax.
      const secret = { CORELOOM_UML_API_KEY: '${{ secrets.CORELOOM_UML_API_KEY }}' }
      expect(steps.map((item) => item.env)).toEqual(
        steps.map((_, index) => (index === detect || index === check ? secret : undefined)),
      )
    })

    it('warns and sets no output without the key, and sets it with one', () => {
      const output = join(tmp, 'github-output')
      /** As a runner runs a `run` step: `bash -e`. */
      const detect = (key: string) => {
        writeFileSync(output, '')
        const { status, stdout } = spawnSync(
          'bash',
          ['-e', '-c', steps[step('Look for the API key')]?.run ?? 'exit 9'],
          { env: { CORELOOM_UML_API_KEY: key, GITHUB_OUTPUT: output }, encoding: 'utf8' },
        )
        return { status, stdout, output: readFileSync(output, 'utf8') }
      }
      const missing = detect('')
      expect(missing.status).toBe(0)
      expect(missing.stdout).toMatch(/^::warning::The agent conventions check was skipped/)
      expect(missing.output).toBe('')
      expect(detect('clu_fixture-key')).toEqual({ status: 0, stdout: '', output: 'present=true\n' })
    })

    it('scans the whole history with a binary pinned by version and checksum', () => {
      const scan = steps[step('Scan for secrets')]?.run ?? ''
      expect(scan).toMatch(/releases\/download\/v(\d+\.\d+\.\d+)\/gitleaks_\1_linux_x64\.tar\.gz/)
      expect(scan).toMatch(
        /echo "[0-9a-f]{64} {2}\$RUNNER_TEMP\/gitleaks\.tar\.gz" \| sha256sum -c -/,
      )
      expect(steps[0]?.uses).toMatch(/^actions\/checkout@/)
      expect((steps[0] as { with?: object }).with).toEqual({
        'persist-credentials': false,
        'fetch-depth': 0,
      })
      expect(spawnSync('bash', ['-n', '-c', scan]).status).toBe(0)
    })
  })
})

describe('Development container', () => {
  const DEVCONTAINER = '.devcontainer/devcontainer.json'
  const FIREWALL = '.devcontainer/init-firewall.sh'
  const security = findQuestionnaire('security') as Questionnaire
  const render = (sandbox?: string) =>
    renderAgentContext({
      project: { name: 'Shop', description: null, architectures: [] },
      questionnaires: [frontendReact, security],
      answers: [
        { questionnaireId: frontendReact.id, questionId: 'package-manager', value: 'pnpm' },
        { questionnaireId: security.id, questionId: 'network-access', value: 'registry' },
        ...(sandbox
          ? [{ questionnaireId: security.id, questionId: 'sandbox', value: sandbox }]
          : []),
      ],
      rules: [],
      notes: null,
      targets: ['claude-code', 'codex', 'gemini-cli', 'cursor'],
      roles: [],
    }).files
  const content = (path: string) => render('container').find((file) => file.path === path)?.content

  it.each([undefined, 'host'])('renders no container for the answer %s', (answer) => {
    expect(render(answer).filter((file) => file.path.startsWith('.devcontainer'))).toEqual([])
    expect(() => read(autonomous, DEVCONTAINER)).toThrow(/ENOENT/)
  })

  it('renders a devcontainer.json that is plain JSON, with its image pinned by digest', () => {
    // No comment and no trailing comma: the CLI merges this file as JSON.
    const json = JSON.parse(content(DEVCONTAINER) ?? '')
    expect(json.image).toMatch(/^[\w./-]+:\d+\.\d+\.\d+-[\w-]+@sha256:[0-9a-f]{64}$/)
    expect(json.runArgs).toEqual(['--cap-add=NET_ADMIN', '--cap-add=NET_RAW'])
    expect(json.postStartCommand).toMatch(/^sudo \S+bash \S+init-firewall\.sh$/)
    expect(json.waitFor).toBe('postStartCommand')
    expect(json.postCreateCommand).toContain(`${FIREWALL} `)
  })

  it('installs each command-line tool at an exact version', () => {
    const { postCreateCommand } = JSON.parse(content(DEVCONTAINER) ?? '')
    const install = /npm install -g (.+)$/.exec(postCreateCommand)?.[1]?.split(' ') ?? []
    expect(install.map((spec) => spec.replace(/@[^@]+$/, ''))).toEqual([
      '@openai/codex',
      '@anthropic-ai/claude-code',
      '@google/gemini-cli',
    ])
    for (const spec of install) expect(spec).toMatch(/@\d+\.\d+\.\d+$/)
  })

  it('renders a firewall script bash accepts', () => {
    const script = join(tmp, 'init-firewall.sh')
    writeFileSync(script, content(FIREWALL) ?? '')
    const { status, stderr } = spawnSync('bash', ['-n', script], { encoding: 'utf8' })
    expect(stderr).toBe('')
    expect(status).toBe(0)
    writeFileSync(script, `${content(FIREWALL)}if then\n`)
    expect(spawnSync('bash', ['-n', script]).status).not.toBe(0)
  })
})

/**
 * The export of the evals to Harbor task folders and the reading of Harbor's job folder, offline:
 * no Harbor, no E2B, no agent. What runs live is in the decision record (section 13).
 */
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { git } from './src/git.ts'
import {
  CREDENTIAL_ENV_NAMES,
  HARBOR_AGENTS,
  HARBOR_OUTPUT_LIMITS,
  SAFE_GIT_CONFIG,
  TEMPLATES_DIR,
} from './src/harbor/constants.ts'
import {
  credentialEnvName,
  HarborAgent,
  type HarborRunInput,
  prepareHarborRun,
  readHarborJob,
  readHarborUsage,
} from './src/harbor/index.ts'
import { Condition, type EvalTask, Verdict } from './src/task.ts'
import { AGENT_CLI_VERSIONS } from './src/versions.ts'
import { conventionFiles, createWorkspaceWithFiles } from './src/workspace.ts'
import { EVAL_TASKS } from './tasks/index.ts'

const root = join(import.meta.dirname, '../../..')
const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-harbor-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

let runs = 0
const filesOf = (task: EvalTask, condition: Condition) =>
  Object.fromEntries(conventionFiles(task, condition).map((file) => [file.path, file.content]))

/** Every task in `none` and `full`, as a user's short test exports them. */
function input(agent: HarborAgent, overrides: Partial<HarborRunInput> = {}): HarborRunInput {
  runs += 1
  const dir = join(tmp, `run-${runs}`)
  mkdirSync(dir, { mode: 0o700 })
  return {
    dir,
    agent,
    model: agent === HarborAgent.Codex ? 'gpt-5-codex' : 'claude-sonnet-5-5',
    providerHost: agent === HarborAgent.Codex ? 'api.openai.com' : 'api.anthropic.com',
    trials: EVAL_TASKS.flatMap((task) =>
      [Condition.None, Condition.Full].map((condition) => ({
        task,
        condition,
        files: filesOf(task, condition),
      })),
    ),
    attempts: 3,
    concurrency: 3,
    runId: 'run-42',
    accountId: 7,
    ...overrides,
  }
}

/** Every regular file under `folder`, by path relative to it. */
function walk(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name)
    return lstatSync(path).isDirectory() ? walk(path).map((inner) => join(name, inner)) : [name]
  })
}

const hashFolder = (folder: string) => {
  const hash = createHash('sha256')
  for (const path of walk(folder).sort()) {
    hash.update(path).update(readFileSync(join(folder, path)))
    hash.update(String(statSync(join(folder, path)).mode & 0o777))
  }
  return hash.digest('hex')
}

describe.each(Object.values(HarborAgent))('prepareHarborRun for %s', (agent) => {
  const run = input(agent)
  const command = prepareHarborRun(run)
  const tasksDir = join(run.dir, 'tasks')

  it('writes one task folder per (task, condition)', async () => {
    await command
    expect(readdirSync(tasksDir).sort()).toEqual(
      run.trials.map((trial) => `${trial.task.id}--${trial.condition}`).sort(),
    )
  })

  it("gives every task the agent's own template, the same bytes each time", async () => {
    await command
    const hashes = readdirSync(tasksDir).map((name) =>
      hashFolder(join(tasksDir, name, 'environment')),
    )
    expect(new Set(hashes).size).toBe(1)
    expect(hashes[0]).toBe(hashFolder(join(TEMPLATES_DIR, agent)))
    const other = agent === HarborAgent.Codex ? HarborAgent.ClaudeCode : HarborAgent.Codex
    expect(hashes[0]).not.toBe(hashFolder(join(TEMPLATES_DIR, other)))
  })

  it('names no credential in a task folder, the command line or its environment', async () => {
    const { args, env, file } = await command
    const own = walk(tasksDir).filter((path) => !path.split('/').includes('workspace'))
    expect(own.some((path) => path.endsWith('task.toml'))).toBe(true)
    const texts = [
      file,
      ...args,
      ...Object.keys(env),
      ...Object.values(env),
      // The workspace holds the fixture and the account's own convention files, not ours.
      ...own.map((path) => readFileSync(join(tasksDir, path), 'utf8')),
    ]
    for (const name of CREDENTIAL_ENV_NAMES) {
      for (const text of texts) expect(text, name).not.toContain(name)
    }
    for (const flag of ['--ae', '--agent-env', '--ee', '--env-file', '--ve', '--verifier-env']) {
      expect(args).not.toContain(flag)
    }
    for (const dockerfile of readdirSync(tasksDir).map((name) =>
      readFileSync(join(tasksDir, name, 'environment', 'Dockerfile'), 'utf8'),
    )) {
      expect(dockerfile).not.toMatch(/^(ARG|ENV) /m)
    }
  })

  it('runs every phase but the agent with no network, the agent as node, and no verifier', async () => {
    const { args } = await command
    for (const name of readdirSync(tasksDir)) {
      const toml = readFileSync(join(tasksDir, name, 'task.toml'), 'utf8')
      expect(toml).toContain(`allowed_hosts = ["${run.providerHost}"]`)
      expect(toml).toContain('user = "node"')
      expect(toml.match(/network_mode = "no-network"/g)).toHaveLength(2)
      expect(toml).toContain('timeout_sec = 600.0')
      expect(toml).toContain('timeout_sec = 120.0')
      expect(toml).toContain('artifacts = [{ source = "/work", destination = "work" }]')
      expect(toml).not.toMatch(/^\[environment\.env\]|^env = /m)
    }
    expect(args).toContain('--disable-verification')
  })

  it('answers the command: the agent at its pinned version, k attempts, our metadata', async () => {
    const { file, args, jobDir, env } = await command
    expect(file).toBe('/opt/harbor/bin/harbor')
    const flag = (name: string) => args[args.indexOf(name) + 1]
    expect(args[0]).toBe('run')
    expect(flag('--path')).toBe(tasksDir)
    expect(flag('--agent')).toBe(HARBOR_AGENTS[agent].importPath)
    expect(flag('--model')).toBe(`${HARBOR_AGENTS[agent].provider}/${run.model}`)
    expect(flag('--env')).toBe('coreloom_harbor.environment:ConventionEvalsE2BEnvironment')
    expect(flag('--n-attempts')).toBe('3')
    expect(flag('--n-concurrent')).toBe('3')
    const kwargs = args.filter((_, at) => ['--ek', '--ak'].includes(args[at - 1] ?? ''))
    expect(kwargs).toEqual(
      expect.arrayContaining([
        'sandbox_timeout_sec=300',
        'renew_interval_sec=60',
        `provider_host="${run.providerHost}"`,
        'coreloom_run="run-42"',
        'coreloom_account=7',
        `version="${AGENT_CLI_VERSIONS[agent]}"`,
      ]),
    )
    expect(jobDir).toBe(join(run.dir, 'jobs', 'run-run-42'))
    expect(env.HARBOR_TELEMETRY).toBe('off')
    expect(env.HOME?.startsWith(run.dir)).toBe(true)
    expect(env.TMPDIR?.startsWith(run.dir)).toBe(true)
  })

  it('builds each fixture with its convention files, origin pointing where it is in the sandbox', async () => {
    await command
    for (const trial of run.trials) {
      const taskDir = join(tasksDir, `${trial.task.id}--${trial.condition}`)
      const repo = join(taskDir, 'workspace', 'repo')
      expect(git(repo, ['remote', 'get-url', 'origin'])).toBe('/work/origin.git')
      for (const [path, content] of Object.entries(trial.files)) {
        expect(readFileSync(join(repo, path), 'utf8')).toContain(content.trimEnd())
      }
      const metadata = JSON.parse(readFileSync(join(taskDir, 'coreloom.json'), 'utf8'))
      expect(metadata).toEqual({
        taskId: trial.task.id,
        condition: trial.condition,
        base: git(repo, ['rev-parse', 'HEAD']),
      })
      expect(readFileSync(join(taskDir, 'instruction.md'), 'utf8')).toBe(
        `${trial.task.instruction}\n`,
      )
    }
  })

  it('writes a solution only for the oracle', async () => {
    await command
    for (const name of readdirSync(tasksDir)) {
      expect(readdirSync(join(tasksDir, name))).not.toContain('solution')
    }
  })
})

describe('prepareHarborRun', () => {
  it("names each agent's credential variable", () => {
    expect(credentialEnvName(HarborAgent.ClaudeCode)).toBe('ANTHROPIC_API_KEY')
    expect(credentialEnvName(HarborAgent.Codex)).toBe('CODEX_API_KEY')
  })

  it('gives the oracle the reference final state of each task, which both graders pass', async () => {
    const run = input(HarborAgent.ClaudeCode, { oracle: true })
    const { args } = await prepareHarborRun(run)
    expect(args[args.indexOf('--agent') + 1]).toBe('oracle')
    expect(args).not.toContain('--model')
    for (const trial of run.trials) {
      const solution = join(run.dir, 'tasks', `${trial.task.id}--${trial.condition}`, 'solution')
      const reference = join(solution, 'reference')
      expect(git(join(reference, 'repo'), ['remote', 'get-url', 'origin'])).toBe('/work/origin.git')
      const metadata = JSON.parse(readFileSync(join(solution, '..', 'coreloom.json'), 'utf8')) as {
        base: string
      }
      const state = {
        root: join(reference, 'repo'),
        base: metadata.base,
        remote: join(reference, 'origin.git'),
      }
      expect(trial.task.success(state).verdict, trial.task.id).toBe(Verdict.Pass)
      expect(trial.task.compliance(state).verdict, trial.task.id).toBe(Verdict.Pass)
      expect(statSync(join(solution, 'solve.sh')).mode & 0o111).not.toBe(0)
    }
  })

  it('refuses a path outside the repository, a trial given twice and no attempt', async () => {
    const [task] = EVAL_TASKS
    if (!task) throw new Error('no task')
    const one = (files: Record<string, string>) => [{ task, condition: Condition.Full, files }]
    await expect(
      prepareHarborRun(input(HarborAgent.Codex, { trials: one({ '../x': 'x' }) })),
    ).rejects.toThrow('outside the repository')
    await expect(
      prepareHarborRun(input(HarborAgent.Codex, { trials: one({ '/etc/x': 'x' }) })),
    ).rejects.toThrow('outside the repository')
    await expect(
      prepareHarborRun(input(HarborAgent.Codex, { trials: one({ '.git/config': 'x' }) })),
    ).rejects.toThrow('inside a Git folder')
    await expect(
      prepareHarborRun(input(HarborAgent.Codex, { trials: [...one({}), ...one({})] })),
    ).rejects.toThrow('twice')
    await expect(prepareHarborRun(input(HarborAgent.Codex, { attempts: 0 }))).rejects.toThrow()
  })
})

describe('readHarborJob', () => {
  const fixture = join(import.meta.dirname, 'fixtures', 'harbor-run')
  const task = EVAL_TASKS.find((candidate) => candidate.id === 'package-manager-pnpm-add')
  if (!task) throw new Error('no package-manager-pnpm-add task')

  /** The recorded job, with the oracle's final workspace built again where Harbor puts it. */
  function recorded() {
    runs += 1
    const dir = join(tmp, `recorded-${runs}`)
    cpSync(fixture, dir, { recursive: true })
    const work = join(
      dir,
      'jobs',
      'run-fixture',
      'package-manager-pnpm-add--none__KmEswdd',
      'artifacts',
      'work',
    )
    mkdirSync(work, { recursive: true })
    const state = createWorkspaceWithFiles(task as EvalTask, Condition.None, {}, work)
    ;(task as EvalTask).reference(state)
    git(state.root, ['remote', 'set-url', 'origin', '/work/origin.git'])
    const metadata = join(dir, 'tasks', 'package-manager-pnpm-add--none', 'coreloom.json')
    writeFileSync(
      metadata,
      JSON.stringify({ taskId: task?.id, condition: 'none', base: state.base }),
    )
    return join(dir, 'jobs', 'run-fixture')
  }

  it('answers one result per trial, attempts numbered in the order they started', async () => {
    const results = await readHarborJob(recorded())
    expect(
      results.map(({ taskId, condition, attempt, error }) => ({
        taskId,
        condition,
        attempt,
        error,
      })),
    ).toEqual([
      { taskId: task.id, condition: 'none', attempt: 1, error: null },
      { taskId: task.id, condition: 'none', attempt: 2, error: 'SandboxException' },
      { taskId: task.id, condition: 'full', attempt: 1, error: 'AgentAuthenticationError' },
      { taskId: task.id, condition: 'full', attempt: 2, error: 'AgentAuthenticationError' },
    ])
    for (const result of results) expect(result.durationMs).toBeGreaterThan(0)
  })

  it("answers the oracle's final workspace, which both graders pass", async () => {
    const [oracle, refused, rejected] = await readHarborJob(recorded())
    if (!oracle?.state) throw new Error('no final state')
    expect(task.success(oracle.state).verdict).toBe(Verdict.Pass)
    expect(task.compliance(oracle.state).verdict).toBe(Verdict.Pass)
    expect(refused?.state).toBeNull()
    expect(rejected?.state).toBeNull()
  })

  it("answers every text Harbor wrote, and Claude Code's usage from its result event", async () => {
    const results = await readHarborJob(recorded())
    const rejected = results[2]
    const paths = rejected?.outputs.map((output) => output.path) ?? []
    expect(paths).toEqual(
      expect.arrayContaining([
        'agent/claude-code.txt',
        'exception.txt',
        'result.json',
        'trial.log',
      ]),
    )
    expect(rejected?.outputs.find((o) => o.path === 'agent/claude-code.txt')?.text).toContain(
      '"api_error_status":401',
    )
    expect(rejected?.usage).toEqual({ input: 0, cachedInput: 0, cacheWrite: 0, output: 0 })
    expect(results[0]?.usage).toBeNull()
    const oraclePaths = results[0]?.outputs.map((output) => output.path) ?? []
    expect(oraclePaths).toContain('result.json')
    expect(oraclePaths.some((path) => path.startsWith('artifacts'))).toBe(false)
    expect(oraclePaths.every((path) => !path.startsWith('/'))).toBe(true)
    expect(results.every((result) => !result.outputsCut)).toBe(true)
  })

  it('sums the usage of every model of a Claude Code run, and reads Harbor’s otherwise', async () => {
    const job = recorded()
    const rejected = join(job, 'package-manager-pnpm-add--full__CjTEN9i')
    const result = {
      type: 'result',
      usage: { input_tokens: 1, output_tokens: 1 },
      modelUsage: {
        'claude-sonnet-5-5': {
          inputTokens: 120,
          cacheReadInputTokens: 900,
          cacheCreationInputTokens: 300,
          outputTokens: 40,
        },
        'claude-haiku-5': { inputTokens: 10, outputTokens: 2 },
      },
    }
    writeFileSync(
      join(rejected, 'agent', 'claude-code.txt'),
      `not json\n${JSON.stringify(result)}\n`,
    )
    const oracle = join(job, 'package-manager-pnpm-add--none__KmEswdd', 'result.json')
    const harbor = JSON.parse(readFileSync(oracle, 'utf8'))
    harbor.agent_result = { n_input_tokens: 1000, n_cache_tokens: 800, n_output_tokens: 50 }
    writeFileSync(oracle, JSON.stringify(harbor))
    const results = await readHarborJob(job)
    expect(results[2]?.usage).toEqual({ input: 130, cachedInput: 900, cacheWrite: 300, output: 42 })
    expect(results[0]?.usage).toEqual({ input: 200, cachedInput: 800, cacheWrite: 0, output: 50 })
  })

  it('answers nothing for a job Harbor never started', async () => {
    expect(await readHarborJob(join(tmp, 'no-such-job'))).toEqual([])
  })

  const oracleWork = (job: string) =>
    join(job, 'package-manager-pnpm-add--none__KmEswdd', 'artifacts', 'work')

  it('hands back a workspace Git can read without running anything the agent wrote', async () => {
    const job = recorded()
    const work = oracleWork(job)
    const marker = join(tmp, `fsmonitor-ran-${runs}`)
    const gitDir = join(work, 'repo', '.git')
    // What a hostile agent leaves: a command in the config, a hook, attributes, an alternate.
    writeFileSync(
      join(gitDir, 'config'),
      `${readFileSync(join(gitDir, 'config'), 'utf8')}[core]\n\tfsmonitor = "touch ${marker}"\n[filter "x"]\n\tsmudge = "touch ${marker}"\n`,
    )
    mkdirSync(join(gitDir, 'hooks'), { recursive: true })
    writeFileSync(join(gitDir, 'hooks', 'post-checkout'), `#!/bin/sh\ntouch ${marker}\n`, {
      mode: 0o755,
    })
    mkdirSync(join(gitDir, 'info'), { recursive: true })
    writeFileSync(join(gitDir, 'info', 'attributes'), '* filter=x\n')
    writeFileSync(join(gitDir, 'objects', 'info', 'alternates'), '/etc\n')
    writeFileSync(
      join(work, 'origin.git', 'config'),
      `[core]\n\tbare = true\n\tfsmonitor = "touch ${marker}"\n`,
    )
    const [oracle] = await readHarborJob(job)
    if (!oracle?.state) throw new Error(`refused: ${oracle?.stateProblem}`)
    expect(readFileSync(join(gitDir, 'config'), 'utf8')).toBe(SAFE_GIT_CONFIG.repo)
    expect(readFileSync(join(work, 'origin.git', 'config'), 'utf8')).toBe(SAFE_GIT_CONFIG.bare)
    for (const path of ['hooks', 'info/attributes', 'objects/info/alternates']) {
      expect(existsSync(join(gitDir, path)), path).toBe(false)
    }
    // Git really reads it: status, the log of the remote and a checkout of HEAD all work.
    expect(task.success(oracle.state).verdict).toBe(Verdict.Pass)
    expect(task.compliance(oracle.state).verdict).toBe(Verdict.Pass)
    git(oracle.state.root, ['status', '--porcelain'])
    expect(existsSync(marker)).toBe(false)
  })

  it('refuses a workspace holding a symbolic link or a .git that is a file', async () => {
    const linked = recorded()
    symlinkSync('/etc/passwd', join(oracleWork(linked), 'repo', 'package-lock.json'))
    const [withLink] = await readHarborJob(linked)
    expect(withLink?.state).toBeNull()
    expect(withLink?.stateProblem).toBe('symbolic link package-lock.json in the workspace')

    const redirected = recorded()
    const repo = join(oracleWork(redirected), 'repo')
    rmSync(join(repo, '.git'), { recursive: true, force: true })
    writeFileSync(join(repo, '.git'), 'gitdir: /etc\n')
    const [withFile] = await readHarborJob(redirected)
    expect(withFile?.state).toBeNull()
    expect(withFile?.stateProblem).toBe('a Git folder that is a file')
  })

  it('caps the texts it answers and leaves out a trial whose metadata does not parse', async () => {
    const job = recorded()
    const rejected = join(job, 'package-manager-pnpm-add--full__CjTEN9i')
    writeFileSync(join(rejected, 'agent', 'big.txt'), 'é'.repeat(HARBOR_OUTPUT_LIMITS.fileBytes))
    const results = await readHarborJob(job)
    const big = results[2]?.outputs.find((output) => output.path === 'agent/big.txt')
    expect(Buffer.byteLength(big?.text ?? '')).toBeLessThanOrEqual(HARBOR_OUTPUT_LIMITS.fileBytes)
    expect(big?.text.endsWith('é')).toBe(true)
    expect(results[2]?.outputsCut).toBe(true)
    const total = (results[2]?.outputs ?? []).reduce((sum, o) => sum + Buffer.byteLength(o.text), 0)
    expect(total).toBeLessThanOrEqual(HARBOR_OUTPUT_LIMITS.trialBytes)

    const metadata = join(
      job,
      '..',
      '..',
      'tasks',
      'package-manager-pnpm-add--full',
      'coreloom.json',
    )
    writeFileSync(
      metadata,
      JSON.stringify({ taskId: 'package-manager-pnpm-add', condition: 'all' }),
    )
    expect((await readHarborJob(job)).map((result) => result.condition)).toEqual(['none', 'none'])
  })

  it("never lets the agent's own result line lower what Harbor counted", async () => {
    const job = recorded()
    const rejected = join(job, 'package-manager-pnpm-add--full__CjTEN9i')
    const understated = { type: 'result', usage: { input_tokens: 1, output_tokens: 1 } }
    writeFileSync(join(rejected, 'agent', 'claude-code.txt'), `${JSON.stringify(understated)}\n`)
    const harbor = JSON.parse(readFileSync(join(rejected, 'result.json'), 'utf8'))
    harbor.agent_result = { n_input_tokens: 5000, n_cache_tokens: 1000, n_output_tokens: 700 }
    writeFileSync(join(rejected, 'result.json'), JSON.stringify(harbor))
    const results = await readHarborJob(job)
    expect(results[2]?.usage).toEqual({
      input: 4000,
      cachedInput: 1000,
      cacheWrite: 0,
      output: 700,
    })
    const polled = await readHarborUsage(job)
    expect(polled.map(({ attempt, usage }) => ({ attempt, usage }))).toEqual(
      results.map(({ attempt, usage }) => ({ attempt, usage })),
    )
    expect(Object.keys(polled[0] ?? {}).sort()).toEqual(['attempt', 'condition', 'taskId', 'usage'])
  })

  it("reads a Codex trial: its output, its CODEX_HOME listing and no usage of Claude's", async () => {
    const results = await readHarborJob(recorded())
    const codex = results.find((result) =>
      result.outputs.some((output) => output.path === 'agent/codex-home.txt'),
    )
    if (!codex) throw new Error('no Codex trial in the fixture')
    expect(codex.error).toBe('AgentAuthenticationError')
    const listing = codex.outputs.find((output) => output.path === 'agent/codex-home.txt')?.text
    expect(listing).toContain('config.toml')
    expect(listing).not.toContain('auth.json')
    expect(codex.outputs.find((o) => o.path === 'agent/codex.txt')?.text).toContain('401')
  })
})

describe('the Harbor classes (infra/evals/coreloom_harbor)', () => {
  const python = (file: string) =>
    readFileSync(join(root, 'infra/evals/coreloom_harbor', file), 'utf8')
  const tuple = (source: string, name: string) =>
    [
      ...(source.match(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm'))?.[1] ?? '').matchAll(
        /"([^"]+)"/g,
      ),
    ].map((match) => match[1])

  it("deny the API's research ranges, as apps/api declares them", () => {
    const api = readFileSync(join(root, 'apps/api/app/research/constants/research.ts'), 'utf8')
    const declared = [
      ...(api.match(/RESEARCH_DENIED_RANGES = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g),
    ].map((match) => match[1])
    expect(declared.length).toBeGreaterThan(0)
    expect(tuple(python('policy.py'), 'RESEARCH_DENIED_RANGES')).toEqual(declared)
    expect(tuple(python('policy.py'), 'EXTRA_DENIED_RANGES')).toEqual([
      '169.254.0.0/16',
      '192.0.2.0/24',
    ])
  })

  it('drop every credential name the exporter knows of, and pin the CLIs the templates hold', () => {
    const policy = python('policy.py')
    for (const name of CREDENTIAL_ENV_NAMES) expect(policy).toContain(`"${name}"`)
    const agents = python('agents.py')
    expect(agents).toContain(`CLAUDE_CODE_VERSION = "${AGENT_CLI_VERSIONS['claude-code']}"`)
    expect(agents).toContain(`CODEX_VERSION = "${AGENT_CLI_VERSIONS.codex}"`)
    expect(python('environment.py')).toContain('TASK_WORKSPACE_DIR = "workspace"')
    expect(relative(root, TEMPLATES_DIR)).toBe(join('infra', 'evals', 'templates'))
  })
})

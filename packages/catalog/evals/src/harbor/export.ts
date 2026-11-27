import { chmodSync, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import { git } from '../git.ts'
import type { Condition, EvalTask, FinalState } from '../task.ts'
import { createWorkspaceWithFiles } from '../workspace.ts'
import {
  AGENT_USER,
  ARTIFACT_WORK_DIR,
  HARBOR_AGENTS,
  HARBOR_BIN,
  HARBOR_ENVIRONMENT,
  HARBOR_TIMEOUTS,
  type HarborAgent,
  ORACLE_AGENT,
  SANDBOX_REMOTE_DIR,
  SANDBOX_REPO_DIR,
  SANDBOX_RESOURCES,
  SANDBOX_WORK_DIR,
  TASK_METADATA_FILE,
  TASK_NAME_SEPARATOR,
  TASK_WORKSPACE_DIR,
  TEMPLATES_DIR,
} from './constants.ts'

export type HarborTrialInput = {
  task: EvalTask
  condition: Condition
  /** The rendered convention files of that condition, by path ({} for `none`). */
  files: Readonly<Record<string, string>>
}

export type HarborRunInput = {
  /** Per-run folder on a tmpfs, 0700, created by the caller and removed by it. */
  dir: string
  agent: HarborAgent
  /** The provider's model id, e.g. `claude-sonnet-5-5`. */
  model: string
  /** The only host the agent phase may reach, e.g. `api.anthropic.com`. */
  providerHost: string
  trials: readonly HarborTrialInput[]
  /** k: attempts of each (task, condition). */
  attempts: number
  /** Trials at once. */
  concurrency: number
  /** Sandbox metadata `coreloom.run` and `coreloom.account`. */
  runId: string
  accountId: number
  /**
   * Runs Harbor's oracle agent instead of the CLI: each task's `solution/` holds its reference
   * final state, copied over `/work`. For the live checks only: no model is called.
   */
  oracle?: boolean
}

export type HarborCommand = {
  /** The program to start, without a shell. */
  file: string
  args: readonly string[]
  /**
   * The child's whole environment but the E2B settings (`E2B_API_KEY`, `E2B_API_URL`,
   * `E2B_SANDBOX_URL`) and the credential (`credentialEnvName`), which the caller adds.
   */
  env: Readonly<Record<string, string>>
  /** Harbor's job folder, for `readHarborJob` once the command exits. */
  jobDir: string
}

/** What the reader needs about a task folder that Harbor does not keep. */
export type TaskMetadata = { taskId: string; condition: Condition; base: string }

/** The variable the caller sets, with the credential, on Harbor's process and only there. */
export function credentialEnvName(agent: HarborAgent): 'ANTHROPIC_API_KEY' | 'CODEX_API_KEY' {
  return HARBOR_AGENTS[agent].credentialEnv
}

/** A task folder's name: the task id and the condition, which the reader splits back. */
export function harborTaskName(taskId: string, condition: Condition): string {
  return `${taskId}${TASK_NAME_SEPARATOR}${condition}`
}

/** A TOML string: JSON's escapes are TOML's for basic strings. */
const tomlString = (value: string) => JSON.stringify(value)

/**
 * The task's `task.toml`: setup and the verifier with no network, the agent phase with the
 * provider's host only, as a user other than root, and `/work` brought back as an artifact.
 * Nothing in it names a credential: the key reaches the agent's command only (decision record,
 * section 5).
 */
export function taskToml(taskId: string, condition: Condition, providerHost: string): string {
  return [
    'schema_version = "1.4"',
    `artifacts = [{ source = ${tomlString(SANDBOX_WORK_DIR)}, destination = "work" }]`,
    '',
    '[metadata]',
    `coreloom_task = ${tomlString(taskId)}`,
    `coreloom_condition = ${tomlString(condition)}`,
    '',
    '[agent]',
    `timeout_sec = ${HARBOR_TIMEOUTS.agentSec}.0`,
    `user = ${tomlString(AGENT_USER)}`,
    'network_mode = "allowlist"',
    `allowed_hosts = [${tomlString(providerHost)}]`,
    '',
    '[verifier]',
    `timeout_sec = ${HARBOR_TIMEOUTS.verifierSec}.0`,
    'network_mode = "no-network"',
    '',
    '[environment]',
    `build_timeout_sec = ${HARBOR_TIMEOUTS.buildSec}.0`,
    'network_mode = "no-network"',
    `workdir = ${tomlString(SANDBOX_REPO_DIR)}`,
    `cpus = ${SANDBOX_RESOURCES.cpus}`,
    `memory_mb = ${SANDBOX_RESOURCES.memoryMb}`,
    '',
  ].join('\n')
}

/** The oracle's script: the reference final state, built here, replaces `/work`. */
const SOLVE_SH = [
  '#!/bin/bash',
  'set -euo pipefail',
  `rm -rf ${SANDBOX_REPO_DIR} ${SANDBOX_REMOTE_DIR}`,
  `cp -a /solution/reference/. ${SANDBOX_WORK_DIR}/`,
  '',
].join('\n')

/**
 * Harbor loads a task only with a verifier script, but none runs (`--disable-verification`):
 * the caller grades the final workspace outside the sandbox. Run anyway, it fails.
 */
const TEST_SH = [
  '#!/bin/bash',
  'echo "convention evals are graded outside the sandbox" >&2',
  'exit 1',
  '',
].join('\n')

function checkFilePath(path: string) {
  const normal = normalize(path)
  if (isAbsolute(path) || normal.startsWith('..') || normal !== path || path.includes('\\')) {
    throw new Error(`convention file path outside the repository: ${path}`)
  }
}

/** Points the repository's `origin` at the bare repository's path in the sandbox. */
function pointAtSandboxRemote(state: FinalState) {
  git(state.root, ['remote', 'set-url', 'origin', SANDBOX_REMOTE_DIR])
}

function writeTask(input: HarborRunInput, trial: HarborTrialInput, tasksDir: string) {
  const { task, condition, files } = trial
  for (const path of Object.keys(files)) checkFilePath(path)
  const taskDir = join(tasksDir, harborTaskName(task.id, condition))
  mkdirSync(taskDir, { recursive: true, mode: 0o700 })
  writeFileSync(join(taskDir, 'task.toml'), taskToml(task.id, condition, input.providerHost))
  writeFileSync(join(taskDir, 'instruction.md'), `${task.instruction}\n`)
  mkdirSync(join(taskDir, 'tests'))
  writeFileSync(join(taskDir, 'tests', 'test.sh'), TEST_SH, { mode: 0o755 })
  // The same folder for every task of an agent, so Harbor builds and caches one template each.
  cpSync(join(TEMPLATES_DIR, input.agent), join(taskDir, 'environment'), { recursive: true })

  const workspace = join(taskDir, TASK_WORKSPACE_DIR)
  mkdirSync(workspace)
  const state = createWorkspaceWithFiles(task, condition, files, workspace)
  pointAtSandboxRemote(state)
  const metadata: TaskMetadata = { taskId: task.id, condition, base: state.base }
  writeFileSync(join(taskDir, TASK_METADATA_FILE), `${JSON.stringify(metadata)}\n`)

  if (input.oracle) {
    const reference = join(taskDir, 'solution', 'reference')
    mkdirSync(reference, { recursive: true })
    const solved = createWorkspaceWithFiles(task, condition, files, reference)
    task.reference(solved)
    pointAtSandboxRemote(solved)
    writeFileSync(join(taskDir, 'solution', 'solve.sh'), SOLVE_SH)
    chmodSync(join(taskDir, 'solution', 'solve.sh'), 0o755)
  }
}

/** A Harbor kwarg (`--ek` / `--ak`): Harbor parses the value as JSON first. */
const kwarg = (flag: string, name: string, value: string | number) => [
  flag,
  `${name}=${JSON.stringify(value)}`,
]

/**
 * Writes one Harbor task folder per (task, condition) under `dir/tasks` and answers the command
 * that runs them all, k attempts each, in E2B sandboxes. The command, its environment and the
 * folders never name a credential: the caller sets `credentialEnvName(agent)` with the key, and
 * the E2B settings, on the child process only. `jobDir` is where Harbor writes the job; the
 * final workspace of each trial comes back under its `artifacts/work`.
 */
export async function prepareHarborRun(input: HarborRunInput): Promise<HarborCommand> {
  if (!Number.isInteger(input.attempts) || input.attempts < 1) throw new Error('attempts < 1')
  if (!Number.isInteger(input.concurrency) || input.concurrency < 1) {
    throw new Error('concurrency < 1')
  }
  if (input.trials.length === 0) throw new Error('no trial to run')
  const names = input.trials.map((trial) => harborTaskName(trial.task.id, trial.condition))
  if (new Set(names).size !== names.length) throw new Error('a (task, condition) given twice')

  const tasksDir = join(input.dir, 'tasks')
  const jobsDir = join(input.dir, 'jobs')
  const home = join(input.dir, 'home')
  const tmp = join(input.dir, 'tmp')
  for (const folder of [tasksDir, jobsDir, home, tmp]) {
    mkdirSync(folder, { recursive: true, mode: 0o700 })
  }
  for (const trial of input.trials) writeTask(input, trial, tasksDir)

  const spec = HARBOR_AGENTS[input.agent]
  const jobName = `run-${input.runId.replace(/[^A-Za-z0-9_-]/g, '-')}`
  const agentArgs = input.oracle
    ? ['--agent', ORACLE_AGENT]
    : [
        '--agent',
        spec.importPath,
        '--model',
        `${spec.provider}/${input.model}`,
        ...kwarg('--ak', 'version', spec.version),
        ...Object.entries(spec.kwargs).flatMap(([name, value]) => kwarg('--ak', name, value)),
      ]
  const args = [
    'run',
    '--path',
    tasksDir,
    ...agentArgs,
    '--env',
    HARBOR_ENVIRONMENT,
    ...kwarg('--ek', 'sandbox_timeout_sec', HARBOR_TIMEOUTS.sandboxSec),
    ...kwarg('--ek', 'renew_interval_sec', HARBOR_TIMEOUTS.renewSec),
    ...kwarg('--ek', 'provider_host', input.providerHost),
    ...kwarg('--ek', 'coreloom_run', input.runId),
    ...kwarg('--ek', 'coreloom_account', input.accountId),
    '--n-attempts',
    String(input.attempts),
    '--n-concurrent',
    String(input.concurrency),
    '--jobs-dir',
    jobsDir,
    '--job-name',
    jobName,
    // Grading is the caller's, on the final workspace: no verifier runs in the sandbox.
    '--disable-verification',
    '--quiet',
  ]
  const env = {
    PATH: '/opt/harbor/bin:/usr/local/bin:/usr/bin:/bin',
    // Harbor's own files (caches, settings) and its temporary files stay in the run's tmpfs.
    HOME: home,
    TMPDIR: tmp,
    // Harbor sends no usage event (harbor/telemetry.py), and LiteLLM reads the model cost map it
    // ships instead of fetching it from GitHub.
    HARBOR_TELEMETRY: 'off',
    LITELLM_LOCAL_MODEL_COST_MAP: 'True',
    PYTHONDONTWRITEBYTECODE: '1',
  }
  return { file: HARBOR_BIN, args, env, jobDir: join(jobsDir, jobName) }
}

/** Where a trial's final repository lands under its folder, for the reader and the tests. */
export const trialWorkDir = (trialDir: string) => join(trialDir, ARTIFACT_WORK_DIR)

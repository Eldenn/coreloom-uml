import { join } from 'node:path'
import { AGENT_CLI_VERSIONS } from '../versions.ts'

/**
 * What a run of the convention evals through Harbor (`harbor run -e e2b`) is made of, read by the
 * exporter and by the reader of the job folder. The Harbor classes it names live in
 * `infra/evals/coreloom_harbor/` (Python, in the `convention-evals` worker's image).
 */

/** The agents path I runs: the real CLI in the sandbox, paid with the user's saved key. */
export const HarborAgent = {
  ClaudeCode: 'claude-code',
  Codex: 'codex',
} as const

export type HarborAgent = (typeof HarborAgent)[keyof typeof HarborAgent]

/** Harbor's own entry point in the worker's image (`/opt/harbor`, a uv virtual environment). */
export const HARBOR_BIN = '/opt/harbor/bin/harbor'

/** Our environment class: Harbor's E2B one with fixes a to g of the decision record. */
export const HARBOR_ENVIRONMENT = 'coreloom_harbor.environment:ConventionEvalsE2BEnvironment'

/** Harbor's agent that runs a task's `solution/solve.sh`: the live checks, never a user's run. */
export const ORACLE_AGENT = 'oracle'

export type HarborAgentSpec = {
  /** Our agent class, by import path. */
  importPath: string
  /** The model provider prefix Harbor parses (`<provider>/<model>`). */
  provider: string
  /** The variable the caller sets, with the credential, on Harbor's process and only there. */
  credentialEnv: 'ANTHROPIC_API_KEY' | 'CODEX_API_KEY'
  /** The CLI version the template holds; the agent class refuses any other. */
  version: string
  /** Agent kwargs (`--ak`) besides the version: values only, never a credential. */
  kwargs: Readonly<Record<string, string | number>>
}

/** Turns of Claude Code in one trial (`--max-turns`): the tasks are a few edits and a commit. */
export const CLAUDE_CODE_MAX_TURNS = 30

export const HARBOR_AGENTS: Readonly<Record<HarborAgent, HarborAgentSpec>> = {
  [HarborAgent.ClaudeCode]: {
    importPath: 'coreloom_harbor.agents:ConventionEvalsClaudeCode',
    provider: 'anthropic',
    credentialEnv: 'ANTHROPIC_API_KEY',
    version: AGENT_CLI_VERSIONS['claude-code'],
    kwargs: { max_turns: CLAUDE_CODE_MAX_TURNS },
  },
  [HarborAgent.Codex]: {
    importPath: 'coreloom_harbor.agents:ConventionEvalsCodex',
    provider: 'openai',
    credentialEnv: 'CODEX_API_KEY',
    version: AGENT_CLI_VERSIONS.codex,
    kwargs: {},
  },
}

/**
 * Every variable name that holds, or could hold, a credential of a model provider, of E2B or of
 * Git hosting. None may appear in a task folder, a command line or the environment the exporter
 * returns: the caller adds the E2B settings and the one credential to the child's environment.
 */
export const CREDENTIAL_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY',
  'CODEX_API_KEY',
  'CODEX_AUTH_JSON_PATH',
  'CODEX_FORCE_AUTH_JSON',
  'E2B_API_KEY',
  'E2B_ACCESS_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
] as const

/**
 * Durations of a trial (decision record, section 7): the sandbox ends by itself 300 s after its
 * last renewal, renewed every 60 s while the trial runs.
 */
export const HARBOR_TIMEOUTS = {
  sandboxSec: 300,
  renewSec: 60,
  agentSec: 600,
  verifierSec: 120,
  buildSec: 600,
} as const

/** Where the fixture lives in the sandbox: the repository and the bare `origin` beside it. */
export const SANDBOX_WORK_DIR = '/work'
export const SANDBOX_REPO_DIR = `${SANDBOX_WORK_DIR}/repo`
export const SANDBOX_REMOTE_DIR = `${SANDBOX_WORK_DIR}/origin.git`

/** The user the agent's command runs as: the template's `node`, never root. */
export const AGENT_USER = 'node'

/** Resources of a trial's sandbox: part of the template's tag, so the same for every task. */
export const SANDBOX_RESOURCES = { cpus: 2, memoryMb: 1024 } as const

/**
 * Names inside a task folder that Harbor does not read but our classes and the reader do: the
 * fixture uploaded at setup, and what the reader needs to make a trial's final state.
 */
export const TASK_WORKSPACE_DIR = 'workspace'
export const TASK_METADATA_FILE = 'coreloom.json'

/** Where Harbor puts the final `/work` of a trial (its `artifacts`), under the trial's folder. */
export const ARTIFACT_WORK_DIR = join('artifacts', 'work')

/** What the reader answers of a trial's texts: never `artifacts/`, each file and the trial capped. */
export const HARBOR_OUTPUT_LIMITS = {
  artifactsDir: 'artifacts',
  fileBytes: 1024 * 1024,
  trialBytes: 8 * 1024 * 1024,
} as const

/**
 * The only `.git/config` a trial's repository keeps once read back: the agent wrote the one it
 * had, and Git would run what it names (`core.fsmonitor`, a `filter.*` driver, `core.sshCommand`…).
 */
export const SAFE_GIT_CONFIG = {
  repo: [
    '[core]',
    '\trepositoryformatversion = 0',
    '\tfilemode = true',
    '\tbare = false',
    '[remote "origin"]',
    `\turl = ${SANDBOX_REMOTE_DIR}`,
    '\tfetch = +refs/heads/*:refs/remotes/origin/*',
    '',
  ].join('\n'),
  bare: ['[core]', '\trepositoryformatversion = 0', '\tfilemode = true', '\tbare = true', ''].join(
    '\n',
  ),
} as const

/**
 * What of a Git folder a read-back repository loses: whatever Git would run (hooks) or follow to
 * another place (alternates, a worktree's `commondir`), and its attributes and per-worktree config.
 */
export const UNSAFE_GIT_PATHS = [
  'hooks',
  join('info', 'attributes'),
  join('objects', 'info', 'alternates'),
  join('objects', 'info', 'http-alternates'),
  'commondir',
  'config.worktree',
] as const

/** Separates a task id from its condition in a task folder's name (ids never hold two hyphens). */
export const TASK_NAME_SEPARATOR = '--'

/** The per-agent E2B templates, copied as is into each task's `environment/`. */
export const TEMPLATES_DIR = join(import.meta.dirname, '../../../../../infra/evals/templates')

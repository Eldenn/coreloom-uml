import { ProviderKind } from '#app/llm-connections/constants/llm-connections'

export { CONVENTION_EVALS_QUEUE } from '#app/convention-evals/constants/queue'

export const EvalRunStatus = {
  Queued: 'queued',
  Running: 'running',
  Done: 'done',
  Failed: 'failed',
  /** Stopped before every trial ran: the cost cap, or the time limit. */
  Cancelled: 'cancelled',
  /** A trial's output held the credential or a secret's shape: nothing of it was stored. */
  Leaked: 'leaked',
} as const
export type EvalRunStatus = (typeof EvalRunStatus)[keyof typeof EvalRunStatus]

/** The statuses a run ends with. */
export const ENDED_STATUSES: readonly EvalRunStatus[] = [
  EvalRunStatus.Done,
  EvalRunStatus.Failed,
  EvalRunStatus.Cancelled,
  EvalRunStatus.Leaked,
]

/**
 * How the trials run. `cli`: a coding agent's own CLI in the sandbox, which calls the provider
 * with the saved key (Harbor; path I of the decision record). `harness`: our loop in the worker
 * calls the model through `@coreloom-uml/llm`, and the sandbox only runs its commands, holding no
 * credential (path II).
 */
export const EvalPath = { Cli: 'cli', Harness: 'harness' } as const
export type EvalPath = (typeof EvalPath)[keyof typeof EvalPath]

/** Who works in the sandbox: the CLI Harbor runs, or our harness. */
export const EvalAgent = { ClaudeCode: 'claude-code', Codex: 'codex', Harness: 'harness' } as const
export type EvalAgent = (typeof EvalAgent)[keyof typeof EvalAgent]

/** What a run says it measured: never one agent's results mixed with another's. */
export const EVAL_AGENT_LABELS: Readonly<Record<EvalAgent, string>> = {
  [EvalAgent.ClaudeCode]: 'Claude Code + your conventions',
  [EvalAgent.Codex]: 'Codex + your conventions',
  [EvalAgent.Harness]: 'your model + your conventions',
}

/** The kinds whose saved key a coding agent's CLI takes (the one exception of the record). */
export const CLI_AGENTS: Partial<Record<ProviderKind, { agent: EvalAgent; providerHost: string }>> =
  {
    [ProviderKind.Anthropic]: { agent: EvalAgent.ClaudeCode, providerHost: 'api.anthropic.com' },
    [ProviderKind.OpenAI]: { agent: EvalAgent.Codex, providerHost: 'api.openai.com' },
  }

/** Kinds whose harness runs one trial at a time: one launch of the binary a step, under its lock. */
export const SERIAL_KINDS: readonly ProviderKind[] = [ProviderKind.ClaudeCode]

/** Why a run, or a trial, ended without its result. Stored and answered as is. */
export const EvalFailureReason = {
  CapReached: 'cap_reached',
  TimeLimit: 'time_limit',
  Leaked: 'leaked',
  /** The worker died with the run: the sweep ends it. */
  Interrupted: 'interrupted',
  SandboxUnavailable: 'sandbox_unavailable',
  RunnerFailed: 'runner_failed',
  GradingFailed: 'grading_failed',
  AgentError: 'agent_error',
  AgentTimeout: 'agent_timeout',
  CredentialUnavailable: 'credential_unavailable',
  NothingToTest: 'nothing_to_test',
  /** The provider refused the credential (Harbor's `AgentAuthenticationError`, a 401). */
  ProviderAuth: 'provider_auth',
  /** Another run holds the account's slot when this one starts. */
  Busy: 'busy',
  /** A path I run reached a worker where `CONVENTION_EVALS_CLI_PATH` is off. */
  CliPathUnavailable: 'cli_path_unavailable',
} as const
export type EvalFailureReason = (typeof EvalFailureReason)[keyof typeof EvalFailureReason]

/** Why the plan refuses a run, for the screen to say. */
export const EvalRefusal = {
  /** None of the held ready-made rules has a task. */
  NoTestableRule: 'no_testable_rule',
  /** A key kind with no key saved, or a subscription not connected. */
  NoCredential: 'no_credential',
  /** The provider settings cannot be called (`providerProblem`). */
  ProviderSettings: 'provider_settings',
  /** Even the lower estimate passes the cap. */
  OverCap: 'over_cap',
  /** A saved key would run path I, which `CONVENTION_EVALS_CLI_PATH` keeps off (#153). */
  CliPathUnavailable: 'cli_path_unavailable',
} as const
export type EvalRefusal = (typeof EvalRefusal)[keyof typeof EvalRefusal]

export const CONVENTION_EVAL_LIMITS = {
  /** Trials of each task and condition (k). */
  attempts: 3,
  /** Trials at once (one for `SERIAL_KINDS`). */
  concurrency: 3,
  /**
   * The hard cap of a run, in US dollars, from measured tokens and `EVAL_PRICES` (an equivalent
   * cost for a subscription). Revised from the pilot's measured p90 (ticket 8). The default: the
   * admin may set another for the instance (`evalCapUsd`, within `CONVENTION_EVAL_CAP_USD`).
   */
  capUsd: 5,
  /** For a kind with no price (`ollama`, `openai-compatible`): the cap is in tokens. */
  maxTokens: 6_000_000,
  /** The job's hard limit: a key is in sandboxes on `cli`, the harness is serial for Claude. */
  hardLimitMs: { cli: 45 * 60_000, harness: 90 * 60_000 },
  /** The account lock outlives the job's limit by this much, then ends by itself. */
  lockMarginMs: 5 * 60_000,
  /** A sandbox ends by itself after this unless renewed, every `sandboxRenewMs`. */
  sandboxTimeoutMs: 300_000,
  sandboxRenewMs: 60_000,
  sandboxStartTimeoutMs: 30_000,
  sandboxRequestTimeoutMs: 20_000,
  /** The fixed commands that take sudo away and stop the agent's processes, as root. */
  sandboxAdminMs: 15_000,
  /** One command of the model in the harness, killed in the sandbox after this many seconds. */
  shellSeconds: 120,
  /** Most of one command's output read back from the sandbox, in bytes. */
  shellOutputMaxBytes: 20_000,
  /** The grading of one trial in its sandbox. */
  gradeSeconds: 120,
  /** What is kept of a trial's filtered output. */
  outputMaxChars: 20_000,
  /** What is kept of a grader's reason. */
  reasonMaxChars: 500,
  /** How often a running Harbor job's folder is read for the cost so far. */
  harborPollMs: 30_000,
  /** Between SIGTERM and SIGKILL to Harbor's process group. */
  killGraceMs: 10_000,
} as const

/** What the screen shows before it confirms: the per-trial tokens, until the pilot measures them. */
export type EvalTokens = { input: number; cachedInput: number; cacheWrite: number; output: number }

/**
 * Tokens of one trial, estimated (decision record, section 9): Claude Code and Codex from their
 * known prompt sizes, the harness from its own (a short system prompt, no provider cache
 * breakpoint, about ten steps). The upper bound is `EVAL_ESTIMATE_P90_FACTOR` times the lower one.
 */
export const EVAL_TRIAL_TOKENS: Readonly<Record<EvalAgent, EvalTokens>> = {
  [EvalAgent.ClaudeCode]: { input: 0, cachedInput: 198_000, cacheWrite: 22_000, output: 3000 },
  [EvalAgent.Codex]: { input: 30_000, cachedInput: 120_000, cacheWrite: 0, output: 5000 },
  [EvalAgent.Harness]: { input: 60_000, cachedInput: 0, cacheWrite: 0, output: 3000 },
}
export const EVAL_ESTIMATE_P90_FACTOR = 2.5

/** The sandboxes of a run carry these, so the sweep finds them whatever made them. */
export const EVAL_SANDBOX_METADATA = {
  purposeKey: 'coreloom.purpose',
  purpose: 'convention-evals',
  runKey: 'coreloom.run',
  accountKey: 'coreloom.account',
  /** Set by Harbor on every sandbox it creates (path I): any key with this prefix. */
  harborPrefix: 'harbor.',
} as const

/** The sweep: every ten minutes, it kills what E2B still lists past `maxAgeMs`. */
export const EVAL_SWEEP_SCHEDULE = {
  key: 'convention-eval-sandboxes-prune',
  pattern: '*/10 * * * *',
  maxAgeMs: 50 * 60_000,
} as const

/** The bounds of the cap the admin sets for the instance, in US dollars. */
export const CONVENTION_EVAL_CAP_USD = { min: 1, max: 100 } as const

export const CONVENTION_EVALS_NOT_FOUND = { error: { message: 'Not found' } } as const
export const CONVENTION_EVAL_RUN_NOT_FOUND = {
  error: { message: 'Convention test not found' },
} as const
export const CONVENTION_EVAL_BUSY = {
  error: { message: 'A convention test is already running for this account.' },
} as const

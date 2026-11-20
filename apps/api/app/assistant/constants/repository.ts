/** The repository sandbox of an assistant conversation (`services/repository-sandbox.ts`). */
export const REPOSITORY_SANDBOX = {
  /** Where the repository is cloned in the sandbox (its Git folder is `<root>.git`). */
  root: '/home/user/repo',
  /** Running between a resume and its pause: E2B kills it after this should the API die first. */
  timeoutMs: 120_000,
  startTimeoutMs: 20_000,
  commandTimeoutMs: 20_000,
  closeTimeoutMs: 5_000,
  /** The clone, Git folder included: past this size it is refused, past this time abandoned. */
  cloneMaxBytes: 200 * 1024 * 1024,
  cloneTimeoutMs: 45_000,
  /** A paused sandbox unused this long is killed by `PruneAssistantSandboxesJob`. */
  maxIdleDays: 7,
  /** Most of one command's output read back, in bytes (capped in the sandbox, then here). */
  outputMaxBytes: 20_000,
  /** One message at a time per conversation: the lock ends by itself after this. */
  lockSeconds: 120,
} as const

/** What the repository tools answer at most. */
export const REPOSITORY_TOOL_LIMITS = {
  listDepth: 2,
  listEntries: 400,
  readLines: 200,
  searchLines: 60,
  searchPerFile: 5,
  searchLineLength: 300,
  queryLength: 200,
  logCommits: 30,
  showLines: 300,
} as const

/** When the daily prune of idle repository sandboxes runs (cron, UTC). */
export const SANDBOX_PRUNE_SCHEDULE = { key: 'assistant-sandboxes-prune', pattern: '30 3 * * *' }

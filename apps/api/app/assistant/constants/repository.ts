import { GRAPHIFY_TESTED_VERSION } from '@coreloom-uml/codemap'

/**
 * The E2B template every repository sandbox starts from: the install's own `base` template (what
 * these sandboxes started from before: Debian, git, Python) plus graphify, pinned to the version
 * `@coreloom-uml/codemap` reads. `node ace assistant:setup` builds it when the install does not
 * hold it yet. Its name carries what it holds: a new graphify version builds a new template by
 * itself; after any other change here, raise `revision`.
 */
export const REPOSITORY_TEMPLATE = {
  from: 'base',
  graphify: `graphifyy==${GRAPHIFY_TESTED_VERSION}`,
  cpuCount: 2,
  /**
   * Twice the base template's: graphify holds the whole graph in memory. Every repository
   * sandbox gets it, the assistant's too, and a self-hosted install backs it with hugepages
   * (`HUGEPAGES`, `infra/e2b`). graphify running out of it reads as `extraction_failed`: raise
   * it then, with `revision`.
   */
  memoryMB: 1024,
  /**
   * Free disk asked for the clone (`cloneMaxBytes`), graphify's work and its graph. Best effort:
   * a self-hosted install (Embed) keeps the base template's disk whatever is asked, about
   * 600 MB free once graphify is installed.
   */
  minFreeDiskMb: 2048,
  revision: 1,
} as const

export const REPOSITORY_TEMPLATE_NAME = `coreloom-uml-repository-${GRAPHIFY_TESTED_VERSION.replaceAll('.', '-')}-r${String(REPOSITORY_TEMPLATE.revision)}`

/**
 * The repository sandbox (`services/repository-sandbox.ts`): of an assistant conversation, and
 * of one GitHub code map import (`code-maps/services/code-map-extraction.ts`).
 */
export const REPOSITORY_SANDBOX = {
  /** Where the repository is cloned in the sandbox (its Git folder is `<root>.git`). */
  root: '/home/user/repo',
  /** Running for one message or import: E2B ends it after this should the API die first. */
  timeoutMs: 120_000,
  /**
   * A conversation's sandbox stays awake this long after its last use (a message, a command
   * of the owner's terminal), then E2B pauses it by itself: the next use within it waits for
   * no resume. Each awake sandbox holds its memory (`REPOSITORY_TEMPLATE.memoryMB`).
   */
  idleMs: 5 * 60_000,
  startTimeoutMs: 20_000,
  commandTimeoutMs: 20_000,
  closeTimeoutMs: 5_000,
  /** Answered for a command the sandbox never answered (gone, unreachable). */
  goneExitCode: 125,
  /** The clone, Git folder included: past this size it is refused, past this time abandoned. */
  cloneMaxBytes: 200 * 1024 * 1024,
  cloneTimeoutMs: 45_000,
  /** The first try, with every file of the history: past it, the files of one commit only. */
  fullCloneTimeoutMs: 25_000,
  /** One command of the model (`SHELL`): killed in the sandbox after this many seconds. */
  shellSeconds: 30,
  /** The least time between two pieces of a running command's output sent to the screen. */
  liveOutputMs: 250,
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
  commandLength: 2000,
} as const

/**
 * The owner's terminal (`TERMINAL`): a person waits longer and reads more than the model does
 * (`shellSeconds`, `outputMaxBytes`). Its answer is streamed, so a long command fits in what a
 * proxy allows one request as long as bytes keep coming.
 */
export const TERMINAL_LIMITS = {
  /** One command: killed in the sandbox after this many seconds. */
  seconds: 120,
  /** Most of one command's output, in bytes (capped in the sandbox, then in the API). */
  outputMaxBytes: 200_000,
  /** A silent stream says it is alive this often (Cloudflare closes one silent for 100 seconds). */
  heartbeatMs: 15_000,
} as const

/** Commands of the owner's terminal, per user and per minute. */
export const TERMINAL_COMMANDS_PER_MINUTE = 60

/** The most of the terminal's folder answered, in characters. */
export const TERMINAL_CWD_MAX_LENGTH = 300

/** When the daily prune of idle repository sandboxes runs (cron, UTC). */
export const SANDBOX_PRUNE_SCHEDULE = { key: 'assistant-sandboxes-prune', pattern: '30 3 * * *' }

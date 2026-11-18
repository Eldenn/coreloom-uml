/** Longest request a web research takes. */
export const RESEARCH_REQUEST_MAX_LENGTH = 2000
/**
 * The whole request, sandbox start included. The production proxy (Cloudflare) closes a request
 * that has not answered after 100 seconds.
 */
export const RESEARCH_REQUEST_BUDGET_MS = 80_000
/** What is kept of the budget to close the sandbox and answer. */
export const RESEARCH_ANSWER_MARGIN_MS = 5_000
/** The least time worth starting the loop with: below it, no page would be read. */
export const RESEARCH_MIN_LOOP_MS = 10_000
/** Starting the sandbox: past this, it counts as unavailable. */
export const RESEARCH_SANDBOX_START_TIMEOUT_MS = 20_000
/** Killing the sandbox before the answer leaves; E2B ends it by itself otherwise. */
export const RESEARCH_SANDBOX_CLOSE_TIMEOUT_MS = 4_000
/** The sandbox ends by itself after this, should the API die before closing it. */
export const RESEARCH_SANDBOX_TIMEOUT_MS = 90_000
/** One command in the sandbox. */
export const RESEARCH_COMMAND_TIMEOUT_MS = 15_000
/** What curl is given to fetch one page, under the command's own timeout. */
export const RESEARCH_PAGE_TIMEOUT_SECONDS = 12
/** Largest page fetched. */
export const RESEARCH_PAGE_MAX_BYTES = 1_000_000
/** Most of a command's output read back from the sandbox. */
export const RESEARCH_COMMAND_OUTPUT_MAX_BYTES = 50_000
/**
 * What a sandbox may never reach: private and link-local addresses. On E2B Cloud they are E2B's
 * own; on a self-hosted install they are the operator's network.
 */
export const RESEARCH_DENIED_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '100.64.0.0/10',
] as const
/** Links kept from one page. */
export const RESEARCH_PAGE_LINKS_MAX = 100
/** Exit code answered for a command that ran out of time, as `timeout(1)` does. */
export const RESEARCH_TIMEOUT_EXIT_CODE = 124
/** One research at a time per account: the lock ends by itself after this. */
export const RESEARCH_LOCK_SECONDS = 90

export const RESEARCH_NOT_FOUND = { error: { message: 'Not found' } } as const
export const RESEARCH_BUSY = {
  error: { message: 'A web research is already running for this account.' },
} as const
export const RESEARCH_NEEDS_TOOLS = {
  error: {
    message: 'The ChatGPT subscription cannot run a web research yet: use another provider.',
  },
} as const

/**
 * What the loop gets of the request's budget once `elapsedMs` are spent (validation, the
 * sandbox's start), or null when too little is left to read a page.
 */
export function researchTimeLeft(elapsedMs: number): number | null {
  const left = RESEARCH_REQUEST_BUDGET_MS - RESEARCH_ANSWER_MARGIN_MS - elapsedMs
  return left >= RESEARCH_MIN_LOOP_MS ? left : null
}

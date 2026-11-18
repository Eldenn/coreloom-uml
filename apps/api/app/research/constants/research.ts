/** Longest request a web research takes. */
export const RESEARCH_REQUEST_MAX_LENGTH = 2000
/**
 * The whole request, sandbox start included. The production proxy (Cloudflare) closes a request
 * that has not answered after 100 seconds.
 */
export const RESEARCH_REQUEST_BUDGET_MS = 80_000
/** What is kept of the budget to close the sandbox and answer. */
export const RESEARCH_ANSWER_MARGIN_MS = 5_000
/** The sandbox ends by itself after this, should the API die before closing it. */
export const RESEARCH_SANDBOX_TIMEOUT_MS = 90_000
/** One command in the sandbox. */
export const RESEARCH_COMMAND_TIMEOUT_MS = 15_000
/** What curl is given to fetch one page, under the command's own timeout. */
export const RESEARCH_PAGE_TIMEOUT_SECONDS = 12
/** Largest page fetched. */
export const RESEARCH_PAGE_MAX_BYTES = 1_000_000
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
    message: 'The Claude subscription cannot run a web research: use a provider with an API key.',
  },
} as const

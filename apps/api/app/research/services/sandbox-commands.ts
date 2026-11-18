import {
  RESEARCH_COMMAND_OUTPUT_MAX_BYTES,
  RESEARCH_PAGE_MAX_BYTES,
  RESEARCH_PAGE_TIMEOUT_SECONDS,
} from '#app/research/constants/research'

/**
 * The only two command lines the API ever runs in a sandbox. Both are fixed: what varies (a URL,
 * the model's command) comes in as an environment variable of that one run, so nothing a page or
 * a model writes is read by the shell that starts them. Both cap what they answer inside the
 * sandbox (`head -c`), so no output can grow in the API's memory, and both fail when the cap is
 * reached (`pipefail`). Tested against this machine's bash and curl
 * (`tests/unit/research/sandbox-commands.spec.ts`).
 */

/**
 * Fetches `$PAGE_URL`. An HTTP error is a failure, not a page (`--fail`); brackets and braces
 * are part of the URL, not ranges (`--globoff`); redirects stay on http and https.
 */
export const FETCH_PAGE = `bash -o pipefail -c '${[
  'curl -sSL --fail --globoff --compressed',
  `--max-time ${RESEARCH_PAGE_TIMEOUT_SECONDS}`,
  `--max-filesize ${RESEARCH_PAGE_MAX_BYTES}`,
  '--proto =http,https --proto-redir =http,https',
  '-- "$PAGE_URL"',
  `| head -c ${RESEARCH_PAGE_MAX_BYTES}`,
].join(' ')}'`

/** Runs `$RESEARCH_COMMAND` in its own shell, its two outputs as one. */
export const RUN_COMMAND = `bash -o pipefail -c 'bash -c "$RESEARCH_COMMAND" 2>&1 | head -c ${RESEARCH_COMMAND_OUTPUT_MAX_BYTES}'`

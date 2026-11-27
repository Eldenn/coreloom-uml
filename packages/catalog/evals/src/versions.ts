/**
 * The exact versions a trial runs with. Harbor is not a dependency of the workspace: it is a
 * Python tool pinned at `HARBOR_VERSION` in the `convention-evals` worker's image (a stage of
 * `apps/api/Dockerfile`, from `infra/evals/requirements.lock`), which runs the trials. Each agent's
 * CLI is in that agent's E2B template (`infra/evals/templates/<agent>/`) at the version below, the
 * same one CI loads the rendered files into; a test keeps them equal.
 */
export const HARBOR_VERSION = '0.27.0'

export const AGENT_CLI_VERSIONS = {
  'claude-code': '2.1.322',
  codex: '0.167.2',
} as const

/** The npm package each CLI is published as, as CI installs it. */
export const AGENT_CLI_PACKAGES = {
  'claude-code': '@anthropic-ai/claude-code',
  codex: '@openai/codex',
} as const

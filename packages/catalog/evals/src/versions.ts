/**
 * The exact versions a trial runs with. Harbor is not a dependency of the workspace: it is a
 * Python tool pinned at `HARBOR_VERSION` in the evals image (`infra/evals/Dockerfile`), which runs
 * the trials. Each agent's CLI is installed in the trial's image at the version below (Harbor's
 * `--ak version=<version>`), the same one CI loads the rendered files into; a test keeps them equal.
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

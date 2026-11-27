import env from '#start/env'

/**
 * Whether a saved Anthropic or OpenAI key may run a convention test (path I, Harbor and the
 * provider's CLI). Off unless `CONVENTION_EVALS_CLI_PATH=enabled`, until #153 lifts it: read by the
 * plan (the route refuses with `cli_path_unavailable`) and again by the worker before it starts
 * Harbor.
 */
export function cliPathEnabled(): boolean {
  return env.get('CONVENTION_EVALS_CLI_PATH') === 'enabled'
}

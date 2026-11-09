import { execFile } from 'node:child_process'
import type { ClaudeRun } from '@coreloom-uml/llm'

/** The binary, found on `PATH` (installed at a pinned version in the API image). */
export const CLAUDE_BINARY = 'claude'
const MAX_OUTPUT_BYTES = 1_000_000

/**
 * The environment of every `claude` process: the account's own folder and nothing of the
 * server's (no database URL, no `APP_KEY`, no provider key it could fall back to).
 */
export function claudeEnv(configDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: configDir,
    CLAUDE_CONFIG_DIR: configDir,
    DISABLE_AUTOUPDATER: '1',
  }
}

/**
 * Runs the unmodified `claude` binary for one account. Resolved from the container, so tests swap
 * it for a fake and never start the binary. Never through a shell; stderr is dropped unread.
 */
export default class ClaudeCodeCli {
  run: ClaudeRun = (args, options) =>
    new Promise((resolve) => {
      const child = execFile(
        CLAUDE_BINARY,
        args,
        {
          cwd: options.configDir,
          env: claudeEnv(options.configDir),
          timeout: options.timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        },
        (error, stdout) => {
          const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null
          resolve({
            exitCode: failure ? (typeof failure.code === 'number' ? failure.code : null) : 0,
            stdout: String(stdout),
            timedOut: failure?.killed === true,
            missing: failure?.code === 'ENOENT',
          })
        },
      )
      child.stdin?.end(options.stdin)
    })
}

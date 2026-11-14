import { spawn } from 'node:child_process'

export type CommandResult = {
  /** The exit code, or `null` when the command could not be started (not installed). */
  code: number | null
  stdout: string
  stderr: string
}

/** Runs a program without a shell: swapped for a double in the tests. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
) => Promise<CommandResult>

/** Longest a command may run before it is stopped. */
const DEFAULT_TIMEOUT_MS = 10 * 60_000

export const runCommand: CommandRunner = (command, args, options) =>
  new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    const done = (code: number | null, extra = '') =>
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8') + extra,
      })
    child.on('error', (error) => done(null, error.message))
    child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0)))
  })

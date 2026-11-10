import { execFile, spawn } from 'node:child_process'
import type { ClaudeRun } from '@coreloom-uml/llm'

/** The binary, found on `PATH` (installed at a pinned version in the API image). */
export const CLAUDE_BINARY = 'claude'
const MAX_OUTPUT_BYTES = 1_000_000
const STATUS_TIMEOUT_MS = 15_000
/** How long the binary may take to accept or refuse a pasted code. */
const SUBMIT_TIMEOUT_MS = 30_000
/** The sign-in page `claude auth login` prints (checked against 2.1.319). */
const LOGIN_URL = /https:\/\/\S+\/oauth\/authorize\?\S+/
/** The error `execFile` gives when the output passes `maxBuffer` (it kills the child too). */
const OUTPUT_TOO_LARGE = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'

/**
 * A `claude auth login` waiting for the code the user copies from Claude's page. The code goes to
 * the binary's stdin as typed; the binary exchanges it and writes its own credentials.
 */
export type ClaudeLogin = {
  /** The page the user opens to sign in, as the binary printed it. */
  url: Promise<string>
  /** Gives the code to the binary: `true` once it says it is signed in. */
  submit(code: string): Promise<boolean>
  kill(): void
}

function quiet(command: string[], configDir: string, timeoutMs: number) {
  return new Promise<{ exitCode: number | null; stdout: string }>((resolve) => {
    execFile(
      CLAUDE_BINARY,
      command,
      {
        cwd: configDir,
        env: claudeEnv(configDir),
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
      },
      (error, stdout) => {
        const code = (error as NodeJS.ErrnoException | null)?.code
        resolve({
          exitCode: error ? (typeof code === 'number' ? code : null) : 0,
          stdout: String(stdout),
        })
      },
    )
  })
}

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
          signal: options.signal,
        },
        (error, stdout) => {
          const failure = error as (NodeJS.ErrnoException & { killed?: boolean }) | null
          resolve({
            exitCode: failure ? (typeof failure.code === 'number' ? failure.code : null) : 0,
            stdout: String(stdout),
            // Killed for too much output is not a timeout: it reads as an unknown failure.
            timedOut:
              (failure?.killed === true && failure.code !== OUTPUT_TOO_LARGE) ||
              failure?.name === 'AbortError',
            missing: failure?.code === 'ENOENT',
          })
        },
      )
      // A binary that exits before reading its prompt closes the pipe: the exit callback reports
      // the failure, and the EPIPE must not reach the process as an uncaught error.
      child.stdin?.on('error', () => {})
      child.stdin?.end(options.stdin)
    })

  /** Whether the binary holds a signed-in account in this folder (`claude auth status`). */
  async status(configDir: string): Promise<boolean> {
    const { stdout } = await quiet(['auth', 'status', '--json'], configDir, STATUS_TIMEOUT_MS)
    try {
      return (JSON.parse(stdout) as { loggedIn?: unknown }).loggedIn === true
    } catch {
      return false
    }
  }

  async logout(configDir: string): Promise<void> {
    await quiet(['auth', 'logout'], configDir, STATUS_TIMEOUT_MS)
  }

  /** Starts `claude auth login --claudeai` (no pty needed: it reads the code from stdin). */
  login(configDir: string): ClaudeLogin {
    const child = spawn(CLAUDE_BINARY, ['auth', 'login', '--claudeai'], {
      cwd: configDir,
      env: claudeEnv(configDir),
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    })
    child.stdin?.on('error', () => {})
    let output = ''
    const exited = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code))
      child.once('error', () => resolve(null))
    })
    const url = new Promise<string>((resolve, reject) => {
      // The URL can arrive split over several chunks: look only at complete lines, then at the
      // whole output once the binary has exited.
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        const found = output.slice(0, output.lastIndexOf('\n') + 1).match(LOGIN_URL)
        if (found) resolve(found[0])
      })
      exited.then(() => {
        const found = output.match(LOGIN_URL)
        if (found) resolve(found[0])
        else reject(new Error('claude auth login printed no sign-in URL'))
      })
    })
    url.catch(() => {})
    return {
      url,
      submit: (code) => {
        const before = output.length
        child.stdin?.write(`${code}\n`)
        return new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), SUBMIT_TIMEOUT_MS)
          const refused = () => {
            if (/invalid/i.test(output.slice(before))) {
              clearTimeout(timer)
              resolve(false)
            }
          }
          child.stdout?.on('data', refused)
          exited.then((exitCode) => {
            clearTimeout(timer)
            resolve(exitCode === 0)
          })
        })
      },
      kill: () => {
        if (child.exitCode === null) child.kill('SIGKILL')
      },
    }
  }
}

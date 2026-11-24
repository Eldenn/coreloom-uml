import { spawn } from 'node:child_process'
import { SKILL_SCAN_LIMITS } from '#app/skills/constants/skill-scan'

/** The binary, found on `PATH` (installed at a pinned commit in the skill-scanner image). */
export const SKILLSPECTOR_BINARY = 'skillspector'

export type SkillScannerRun = {
  /** 0: nothing past SkillSpector's threshold, 1: past it, 2 or null: it failed. */
  exitCode: number | null
  timedOut: boolean
  missing: boolean
}

/**
 * Runs the unmodified `skillspector` binary on one folder, static analysis only (`--no-llm`), its
 * JSON report written to `reportPath`. Never through a shell; its environment holds nothing of
 * the worker's (no database, Drive or Redis setting, no `APP_KEY`), and its console output is
 * ignored: only the report file counts. Resolved from the container, so tests swap it for a fake
 * and never start the binary.
 */
export default class SkillScanner {
  run(folder: string, reportPath: string, workDir: string): Promise<SkillScannerRun> {
    return new Promise((resolve) => {
      let settled = false
      const settle = (run: SkillScannerRun) => {
        if (settled) return
        settled = true
        resolve(run)
      }
      const child = spawn(
        SKILLSPECTOR_BINARY,
        ['scan', folder, '--no-llm', '--format', 'json', '--output', reportPath],
        {
          cwd: workDir,
          env: {
            PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
            HOME: workDir,
            NO_COLOR: '1',
          },
          stdio: 'ignore',
          timeout: SKILL_SCAN_LIMITS.timeoutMs,
          killSignal: 'SIGKILL',
          windowsHide: true,
        },
      )
      child.on('error', (error: NodeJS.ErrnoException) =>
        settle({ exitCode: null, timedOut: false, missing: error.code === 'ENOENT' }),
      )
      child.on('close', (code, signal) =>
        settle({ exitCode: code, timedOut: signal === 'SIGKILL', missing: false }),
      )
    })
  }
}

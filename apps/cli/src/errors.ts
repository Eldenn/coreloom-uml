/** The process exit codes, as documented in the README. */
export const ExitCode = {
  Ok: 0,
  /** A network error, a refused key, a missing project, a refused path… */
  Error: 1,
  /** A block edited by hand was left as it is. */
  EditedBlockKept: 2,
  /** `check`: a newer generation exists. */
  Stale: 3,
  /** `check`: a managed block, or its file, is missing. */
  BlockMissing: 4,
} as const

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode]

/** An error whose message is meant for the user, printed without a stack trace. */
export class CliError extends Error {
  readonly exitCode: ExitCode

  constructor(message: string, exitCode: ExitCode = ExitCode.Error) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

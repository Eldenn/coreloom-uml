import { CliError, ExitCode } from './errors.ts'
import type { Io } from './io.ts'
import { storeApiKey } from './settings.ts'

/**
 * `config set-key`: reads the key on standard input (or asks for it, hidden, in a terminal) and
 * stores it in the user configuration file, mode 0600. Never from an argument.
 */
export async function setKey(options: { io: Io; env?: NodeJS.ProcessEnv }): Promise<ExitCode> {
  const { io } = options
  const raw = io.interactive ? await io.secret('API key (clu_…)') : await io.readStdin()
  const key = raw.trim()
  if (!key) throw new CliError('No key read.')
  const path = await storeApiKey(key, options.env)
  io.log(`Key stored in ${path}.`)
  return ExitCode.Ok
}

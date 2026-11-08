import { confirm, isCancel, password } from '@clack/prompts'

/** Everything a command prints or asks: swapped for a recording double in the tests. */
export type Io = {
  /** Whether questions can be asked (a terminal on both ends). */
  readonly interactive: boolean
  log(message: string): void
  warn(message: string): void
  confirm(message: string): Promise<boolean>
  /** Asks for a secret without echoing it. */
  secret(message: string): Promise<string>
  /** Reads standard input to its end. */
  readStdin(): Promise<string>
}

export function terminalIo(): Io {
  return {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    log: (message) => console.log(message),
    warn: (message) => console.error(message),
    async confirm(message) {
      const answer = await confirm({ message, initialValue: false })
      return !isCancel(answer) && answer === true
    },
    async secret(message) {
      const answer = await password({ message })
      return isCancel(answer) ? '' : answer
    },
    async readStdin() {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks).toString('utf8')
    },
  }
}

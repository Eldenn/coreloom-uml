// The owner's own terminal in the conversation's repository sandbox: the one the assistant reads
// the code in, as it left it (no network, nothing of ours in it). Each command is one call to the
// API, which answers what it printed. Nothing typed or printed here is kept once it is closed.
import { SquareTerminalIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Terminal, useTerminal } from '@/components/ui/terminal'
import { useRunSandboxCommand } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { useT } from '@/lib/locale'

export function AssistantTerminal({ conversationId }: { conversationId: number }) {
  const t = useT().assistant
  const enabled = useFeature('assistant-repository')
  const run = useRunSandboxCommand(conversationId)
  const terminal = useTerminal({
    prompt: '$ ',
    welcome: t.terminalWelcome,
    // A refusal (no sandbox yet, the assistant using it) is thrown: the terminal prints it in red.
    onCommand: async (command) => {
      try {
        const { exitCode, output } = await run.mutateAsync(command)
        return exitCode === 0 ? output : `${output}${t.activityExit(exitCode)}\n`
      } catch (error) {
        throw new Error(getErrorMessage(error, t.actionFailed), { cause: error })
      }
    },
  })
  if (!enabled) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="self-start">
          <SquareTerminalIcon aria-hidden />
          {t.terminal}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.terminal}</DialogTitle>
          <DialogDescription>{t.terminalHint}</DialogDescription>
        </DialogHeader>
        <Terminal terminal={terminal} title={t.terminal} className="h-[26rem]" />
      </DialogContent>
    </Dialog>
  )
}

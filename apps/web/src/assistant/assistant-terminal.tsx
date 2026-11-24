// The owner's own terminal in the conversation's repository sandbox: the one the assistant reads
// the code in, as it left it (no network, nothing of ours in it). Each command is one call to the
// API, which answers what it printed and the folder it ended in. Nothing typed or printed here is
// kept once it is closed.
import { SquareTerminalIcon } from 'lucide-react'
import * as React from 'react'

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
import { useConversation, useRunSandboxCommand } from '@/lib/assistant'
import { getErrorMessage } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { useT } from '@/lib/locale'

export function AssistantTerminal({ conversationId }: { conversationId: number }) {
  const t = useT().assistant
  const enabled = useFeature('assistant-repository')
  // Shown once the assistant opened a repository in this conversation: it then has a sandbox.
  const available = useConversation(conversationId).data?.sandbox ?? false
  const run = useRunSandboxCommand(conversationId)
  // The folder the sandbox says the last command ended in: the next one starts there.
  const [cwd, setCwd] = React.useState<string | null>(null)
  const terminal = useTerminal({
    prompt: cwd === null ? '$ ' : `${cwd} $ `,
    welcome: t.terminalWelcome,
    // A refusal (the assistant using the sandbox) is thrown: the terminal prints it in red.
    // Ctrl+C aborts the call, and the API then stops the command in the sandbox.
    onCommand: async (command, { signal }) => {
      try {
        const ran = await run.mutateAsync({ command, signal })
        setCwd(ran.cwd)
        return ran.exitCode === 0 ? ran.output : `${ran.output}${t.activityExit(ran.exitCode)}\n`
      } catch (error) {
        throw new Error(getErrorMessage(error, t.actionFailed), { cause: error })
      }
    },
  })
  if (!enabled || !available) return null
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

// Accepting, rejecting and undoing the assistant's proposed changes from the panel, through the
// architecture each message is about: with `applyChange` on that architecture's own page, so the
// editor's text is kept; one action at a time, failures said in the UI's language.
import * as React from 'react'

import type { ChangeActions } from '@/assistant/assistant-messages'
import { toast } from '@/components/ui/sonner'
import {
  applyChange,
  type AssistantMessage,
  type AutosaveControl,
  type ChangeAction,
  type ProposedChange,
  useChangeAction,
} from '@/lib/assistant'
import { TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'
import type { Messages } from '@/messages'

type AssistantMessages = Messages['assistant']

/** A refused action as a sentence: the API's 409 `error.code`, a 422 invalid view, or a retry. */
export function changeErrorText(error: unknown, t: AssistantMessages): string {
  if (!(error instanceof TuyauError)) return t.actionFailed
  if (error.status === 422) return t.invalidChange
  const code = (error.response as { error?: { code?: string } } | undefined)?.error?.code
  if (error.status === 409 && code !== undefined && code in t.conflicts)
    return t.conflicts[code as keyof AssistantMessages['conflicts']]
  return t.actionFailed
}

export function useChangeActions(
  conversationId: number,
  /** The architecture whose page the panel is on, with its editor's autosave; `null` elsewhere. */
  page: { architectureId: number; autosave: AutosaveControl } | null,
): ChangeActions {
  const t = useT().assistant
  const changeAction = useChangeAction()
  // Held from the save before an action to its answer, so a second click waits for the first.
  const running = React.useRef(false)
  const [busy, setBusy] = React.useState(false)

  const run = async (message: AssistantMessage, change: ProposedChange, action: ChangeAction) => {
    const architectureId = message.architectureId
    // Its architecture was deleted: the card offers no action.
    if (architectureId === null) return
    const call = () =>
      changeAction.mutateAsync({
        architectureId,
        conversationId,
        messageId: message.id,
        index: change.index,
        action,
      })
    try {
      // Elsewhere no editor holds unsaved text of that view: the server's version check decides.
      const result =
        page?.architectureId === architectureId
          ? await applyChange(page.autosave, action, change, call)
          : { done: await call() }
      if ('refused' in result)
        toast.error(result.refused === 'unreadable' ? t.fixEditsFirst : t.saveFirst)
    } catch (error) {
      toast.error(changeErrorText(error, t))
    }
  }

  const exclusive = async (task: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await task()
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return {
    act: (message, change, action) => exclusive(() => run(message, change, action)),
    acceptAll: (message: AssistantMessage) =>
      exclusive(async () => {
        // One after the other: each one is applied, or turns stale, on its own.
        for (const change of message.changes ?? []) {
          if (change.status === 'pending') await run(message, change, 'accept')
        }
      }),
    busy,
  }
}

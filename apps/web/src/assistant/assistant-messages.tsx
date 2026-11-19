// The messages of one assistant conversation: the owner's, the assistant's with the view changes,
// the rules or the actions it proposed, and a summary carried over from an earlier conversation.
import { Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { AssistantActionCard } from '@/assistant/assistant-action-card'
import { AssistantChangeCard } from '@/assistant/assistant-change-card'
import { MessageProposals } from '@/assistant/assistant-proposals'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { Popconfirm } from '@/components/ui/popconfirm'
import { TypingIndicator } from '@/components/ui/typing-indicator'
import type { AssistantMessage, ChangeAction, ProposedChange } from '@/lib/assistant'
import { useT } from '@/lib/locale'

/** What the change buttons call (`useChangeActions` in the panel). */
export interface ChangeActions {
  act: (message: AssistantMessage, change: ProposedChange, action: ChangeAction) => Promise<void>
  acceptAll: (message: AssistantMessage) => Promise<void>
  /** An action is on its way: the buttons wait. */
  busy: boolean
}

/** The messages, the one on its way and the assistant typing; follows the newest. */
export function MessageList({
  conversationId,
  messages,
  loaded,
  asking,
  waiting,
  progress,
  pageArchitectureId,
  changes,
  onDeleteSummary,
}: {
  conversationId: number
  messages: AssistantMessage[]
  loaded: boolean
  /** The message being sent, shown until the answer arrives. */
  asking: string | null
  waiting: boolean
  /** What a web research is doing, shown under the message being sent. */
  progress?: React.ReactNode
  /** The architecture whose page the panel is on; `null` elsewhere. */
  pageArchitectureId: number | null
  changes: ChangeActions
  onDeleteSummary: (messageId: number) => void
}) {
  const t = useT().assistant
  const end = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, waiting, asking])
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {loaded && messages.length === 0 && asking === null && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.empty}</p>
      )}
      {messages.map((message) => (
        <Message
          key={message.id}
          conversationId={conversationId}
          message={message}
          here={message.architectureId !== null && message.architectureId === pageArchitectureId}
          busy={changes.busy}
          onAction={(change, action) => void changes.act(message, change, action)}
          onAcceptAll={() => void changes.acceptAll(message)}
          onDeleteSummary={() => {
            onDeleteSummary(message.id)
          }}
        />
      ))}
      {asking !== null && <UserBubble text={asking} />}
      {progress}
      {waiting && <TypingIndicator name={t.title} />}
      <div ref={end} />
    </div>
  )
}

function UserBubble({ text }: { text: string }) {
  const t = useT().assistant
  return (
    <div className="ml-6 self-end rounded-md bg-secondary px-3 py-2 text-foreground">
      <span className="sr-only">{t.you}: </span>
      <p className="m-0 whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function Message({
  conversationId,
  message,
  here,
  busy,
  onAction,
  onAcceptAll,
  onDeleteSummary,
}: {
  conversationId: number
  message: AssistantMessage
  here: boolean
  busy: boolean
  onAction: (change: ProposedChange, action: ChangeAction) => void
  onAcceptAll: () => void
  onDeleteSummary: () => void
}) {
  const t = useT().assistant
  if (message.role === 'user') return <UserBubble text={message.content} />
  if (message.role === 'summary')
    return (
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-secondary p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-muted-foreground">{t.summary}</span>
          <Popconfirm
            title={t.deleteSummary}
            description={t.deleteSummaryHint}
            confirmLabel={t.delete}
            destructive
            onConfirm={onDeleteSummary}
          >
            <Button size="icon-sm" variant="ghost" aria-label={t.deleteSummary}>
              <Trash2Icon />
            </Button>
          </Popconfirm>
        </div>
        <Markdown className="text-[13px]">{message.content}</Markdown>
      </div>
    )
  const changes = message.changes ?? []
  const pending = changes.filter((c) => c.status === 'pending').length
  return (
    <div className="mr-6 flex flex-col gap-2">
      {message.content !== '' && <Markdown>{message.content}</Markdown>}
      {message.proposals && (
        <MessageProposals
          conversationId={conversationId}
          messageId={message.id}
          proposals={message.proposals}
        />
      )}
      {message.actions?.map((action) => (
        <AssistantActionCard
          key={action.index}
          conversationId={conversationId}
          messageId={message.id}
          action={action}
        />
      ))}
      {changes.map((change) => (
        <AssistantChangeCard
          key={change.index}
          change={change}
          architectureId={message.architectureId}
          here={here}
          busy={busy}
          onAction={(action) => {
            onAction(change, action)
          }}
        />
      ))}
      {pending > 1 && message.architectureId !== null && (
        <Button
          size="sm"
          variant="secondary"
          className="w-fit"
          disabled={busy}
          onClick={onAcceptAll}
        >
          {t.acceptAll}
        </Button>
      )}
    </div>
  )
}

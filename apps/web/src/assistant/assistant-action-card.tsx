// One action the assistant proposed on the account's work (a project, an architecture, agent
// conventions): what it would do, the owner's answer while it is pending, then how it ended, with
// a link to what it made or changed. Nothing is applied before the owner accepts.
import { Link } from '@tanstack/react-router'
import * as React from 'react'

import { AnswerButtons, ProposalCard } from '@/assistant/assistant-change-card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/sonner'
import { type AssistantAction, useActionAnswer } from '@/lib/assistant'
import { actionImpact, actionRows } from '@/lib/assistant-actions'
import { getErrorMessage, TuyauError } from '@/lib/client'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'

const LINK =
  'w-fit text-[13px] text-primary-text underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring'

/** Whether the server kept the action pending because it no longer did what its card said. */
function wasChanged(error: unknown): boolean {
  if (!(error instanceof TuyauError)) return false
  const body = error.response as { error?: { code?: string } } | undefined
  return body?.error?.code === 'changed'
}

/** The page of what an accepted action made or changed. */
function ResultLink({ result }: { result: NonNullable<AssistantAction['result']> }) {
  const t = useT().assistant.actionOpen
  if (result.kind === 'project')
    return (
      <Link to="/projects/$projectId" params={{ projectId: result.id }} className={LINK}>
        {t.project}
      </Link>
    )
  if (result.kind === 'architecture')
    return (
      <Link to="/architectures/$id" params={{ id: result.id }} className={LINK}>
        {t.architecture}
      </Link>
    )
  return (
    <Link to="/agent-configs/$id" params={{ id: result.id }} className={LINK}>
      {t['agent-config']}
    </Link>
  )
}

export function AssistantActionCard({
  conversationId,
  messageId,
  action,
}: {
  conversationId: number
  messageId: number
  action: AssistantAction
}) {
  const t = useT().assistant
  const visibilities: Record<string, string> = useCoreloomI18n().messages.diagramCard.visibility
  // A visibility is shown by its localized name.
  const shown = (label: string, value: string) =>
    label === 'visibility' && Object.hasOwn(visibilities, value) ? visibilities[value] : value
  const impact = actionImpact(action.impact)
  const answer = useActionAnswer(conversationId)
  const card = React.useRef<HTMLDivElement>(null)
  // The server refused to apply a card that no longer said what it would do, and refreshed it.
  const changed = wasChanged(answer.error)
  const known = Object.hasOwn(t.actions, action.name)
  // The buttons leave with the answer: the focus goes to the link it brought, else to the card.
  const answered = React.useRef(false)
  React.useEffect(() => {
    if (!answered.current || action.status === 'pending') return
    answered.current = false
    ;(card.current?.querySelector('a') ?? card.current)?.focus()
  }, [action.status])

  return (
    <ProposalCard
      ref={card}
      label={
        <>
          <Badge variant="outline">
            {known ? t.actions[action.name as keyof typeof t.actions] : t.actionUnknown}
          </Badge>
          {action.destructive && <Badge variant="destructive">{t.destructive}</Badge>}
        </>
      }
      title={known ? undefined : <code>{action.name}</code>}
      status={action.status}
    >
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] empty:hidden">
        {actionRows(action).map((row) => (
          <React.Fragment key={row.label}>
            <dt className="text-muted-foreground">{t.actionRows[row.label]}</dt>
            <dd className="m-0 min-w-0 break-words whitespace-pre-wrap text-foreground">
              {row.from !== undefined && (
                <>
                  <span className="text-muted-foreground">{shown(row.label, row.from)}</span>{' '}
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">{t.becomes}</span>{' '}
                </>
              )}
              {shown(row.label, row.value)}
            </dd>
          </React.Fragment>
        ))}
        {impact.length > 0 && (
          <>
            <dt className="text-muted-foreground">{t.actionImpactLabel}</dt>
            <dd className="m-0 min-w-0 text-foreground">
              {impact.map(({ kind, count }) => t.actionImpact[kind](count)).join(', ')}
            </dd>
          </>
        )}
      </dl>
      {action.status === 'failed' && action.failure !== null && (
        <p className="m-0 text-[13px] text-destructive">
          {t.actionFailures[action.failure]}
          {/* Why the server refused it, known only from the answer itself. */}
          {action.failure === 'invalid' &&
            answer.isError &&
            ` ${getErrorMessage(answer.error, '')}`}
        </p>
      )}
      {action.status === 'pending' && changed && (
        <p role="status" className="m-0 text-[13px] text-destructive">
          {t.actionChanged}
        </p>
      )}
      {/* A deletion's result is null: its target is gone, so there is nothing to open. */}
      {action.status === 'accepted' && action.result && <ResultLink result={action.result} />}
      {action.status === 'pending' && (
        <AnswerButtons
          busy={answer.isPending}
          destructive={action.destructive}
          onAnswer={(choice) => {
            answered.current = true
            answer.mutate(
              { messageId, index: action.index, answer: choice },
              {
                onError: (error) => {
                  // A refusal that carries the action shows on the card; any other is told here.
                  const told =
                    error instanceof TuyauError &&
                    (error.response as { action?: unknown } | undefined)?.action !== undefined
                  if (!told) toast.error(t.actionFailed)
                },
              },
            )
          }}
        />
      )}
    </ProposalCard>
  )
}

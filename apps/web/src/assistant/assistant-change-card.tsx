// One view change the assistant proposed: what it does, its diff in the view's own text format,
// and the owner's answer (accept or reject while pending, undo once accepted). Away from its
// architecture's page it links there; once that architecture is deleted it only tells what it was.
import { Link } from '@tanstack/react-router'
import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DiffViewer } from '@/components/ui/diff-viewer'
import type { ChangeAction, ProposedChange } from '@/lib/assistant'
import { diffText } from '@/lib/diff-text'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'

const STATUS_VARIANT = {
  pending: 'default',
  accepted: 'success',
  rejected: 'secondary',
  stale: 'warning',
  undone: 'secondary',
  failed: 'destructive',
} as const

/**
 * The frame of a proposal's card, shared with the actions on the account's work: what it does, a
 * title, its state (announced when it changes), then its content.
 */
export function ProposalCard({
  ref,
  label,
  title,
  status,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>
  label: React.ReactNode
  title?: React.ReactNode
  status: keyof typeof STATUS_VARIANT
  children: React.ReactNode
}) {
  const t = useT().assistant
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <div className="flex flex-wrap items-center gap-2">
        {label}
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
        <span role="status">
          <Badge variant={STATUS_VARIANT[status]}>{t.statuses[status]}</Badge>
        </span>
      </div>
      {children}
    </div>
  )
}

/** Accept or reject, while a proposal is pending. */
export function AnswerButtons({
  busy,
  destructive = false,
  onAnswer,
}: {
  /** Another answer is on its way: the buttons wait. */
  busy: boolean
  /** Accepting cannot be undone: the card is the confirmation, its accept button says so. */
  destructive?: boolean
  onAnswer: (answer: 'accept' | 'reject') => void
}) {
  const t = useT().assistant
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={destructive ? 'destructive' : 'secondary'}
        disabled={busy}
        onClick={() => {
          onAnswer('accept')
        }}
      >
        {t.accept}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          onAnswer('reject')
        }}
      >
        {t.reject}
      </Button>
    </div>
  )
}

export function AssistantChangeCard({
  change,
  architectureId,
  here,
  busy,
  onAction,
}: {
  change: ProposedChange
  /** The architecture the change is for; `null` once it was deleted. */
  architectureId: number | null
  /** The panel is on that architecture's page: the workspace beside it shows the view. */
  here: boolean
  /** Another action is on its way: the buttons wait. */
  busy: boolean
  onAction: (action: ChangeAction) => void
}) {
  const t = useT().assistant
  const problemText = useCoreloomI18n().messages.diagramEditor.problem
  return (
    <ProposalCard
      label={<Badge variant="outline">{t.ops[change.op]}</Badge>}
      title={change.title}
      status={change.status}
    >
      {change.status === 'failed' ? (
        <div className="text-[13px] text-destructive">
          <p className="m-0">{t.failedHint}</p>
          <ul className="m-0 pl-5">
            {change.problems.map((problem) => (
              <li key={`${String(problem.line)}:${problem.code}:${problem.text ?? ''}`}>
                {problemText[problem.code]}
                {problem.text ? ` ${problem.text}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <DiffViewer
          before={diffText(change.before, change.format)}
          after={diffText(change.after, change.format)}
          beforeLabel={t.before}
          afterLabel={t.after}
          wrap
          className="max-h-80 overflow-auto"
        />
      )}
      {(change.placed > 0 || change.relayout) && (
        <p className="m-0 text-[13px] text-muted-foreground">
          {change.relayout ? t.relayout : t.placed(change.placed)}
        </p>
      )}
      {change.status === 'stale' && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.staleHint}</p>
      )}
      {architectureId === null && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.changeGone}</p>
      )}
      {architectureId !== null && !here && (
        <Link
          to="/architectures/$id"
          params={{ id: architectureId }}
          search={change.diagramId === null ? {} : { diagram: change.diagramId }}
          className="w-fit text-[13px] text-primary-text underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {change.diagramId === null ? t.openArchitecture : t.openView}
        </Link>
      )}
      {architectureId !== null && change.status === 'pending' && (
        <AnswerButtons busy={busy} onAnswer={onAction} />
      )}
      {architectureId !== null && change.status === 'accepted' && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={busy}
          onClick={() => {
            onAction('undo')
          }}
        >
          {t.undo}
        </Button>
      )}
    </ProposalCard>
  )
}

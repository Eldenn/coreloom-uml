// One action the assistant proposed on the account's work (a project, an architecture, agent
// conventions): what it would do, the owner's answer while it is pending, then how it ended, with
// a link to what it made or changed. Nothing is applied before the owner accepts.
import { Link } from '@tanstack/react-router'
import * as React from 'react'

import { AnswerButtons, ProposalCard } from '@/assistant/assistant-change-card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/components/ui/sonner'
import { useRolePresets } from '@/lib/agent-roles'
import { type AssistantAction, useActionAnswer } from '@/lib/assistant'
import {
  actionDomain,
  actionImpact,
  type ActionRowLabel,
  actionRows,
} from '@/lib/assistant-actions'
import { getErrorMessage, TuyauError } from '@/lib/client'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'
import { cn } from '@/lib/utils'

const LINK =
  'w-fit text-[13px] text-primary-text underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring'

/** Whether the server kept the action pending because it no longer did what its card said. */
function wasChanged(error: unknown): boolean {
  if (!(error instanceof TuyauError)) return false
  const body = error.response as { error?: { code?: string } } | undefined
  return body?.error?.code === 'changed'
}

/** The page of what an accepted action made or changed: the project's Code or Design tab for theirs. */
function ResultLink({
  result,
  tab,
}: {
  result: NonNullable<AssistantAction['result']>
  tab: 'code' | 'design' | null
}) {
  const t = useT().assistant.actionOpen
  if (result.kind === 'project' && tab)
    return (
      <Link
        to="/projects/$projectId"
        params={{ projectId: result.id }}
        search={{ tab }}
        className={LINK}
      >
        {t[tab]}
      </Link>
    )
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

/**
 * How a card shows a row's value: a visibility, a right, a follow, a finding's resolution or a
 * preset by its localized or full name, an empty scope as the whole repository and an empty
 * branch as the default one.
 */
function useShownValue(action: AssistantAction) {
  const t = useT()
  const i18n = useCoreloomI18n().messages
  const names: Partial<Record<ActionRowLabel, Record<string, string>>> = {
    visibility: i18n.diagramCard.visibility,
    follow: t.assistant.actionFollow,
    resolution: { open: t.assistant.actionResolutionOpen, ...i18n.findingCard.resolved },
    category: t.design.categories,
    priority: t.design.priorities,
    status: t.design.statuses,
  }
  const empty: Partial<Record<ActionRowLabel, string>> = {
    scope: t.assistant.actionWholeRepository,
    branch: t.assistant.actionDefaultBranch,
    project: t.assistant.actionOutsideProject,
    readyRule: t.assistant.actionWholeSlot,
  }
  const rights: Record<string, string> = t.roles.rightNames
  const presets = useRolePresets(action.name === 'add_role_from_preset').data
  const named = (known: Record<string, string>, value: string) =>
    Object.hasOwn(known, value) ? known[value] : value
  return (label: ActionRowLabel, value: string): string => {
    const known = names[label]
    if (known) return named(known, value)
    if (label === 'rights')
      return value
        .split(', ')
        .map((right) => named(rights, right))
        .join(', ')
    if (value === '' && empty[label] !== undefined) return empty[label]
    // A field the action empties.
    if (value === '') return t.assistant.actionNone
    if (label === 'preset') return presets?.find((item) => item.slug === value)?.name ?? value
    return value
  }
}

/** What the action would do, line by line, then what goes with it. */
function ActionDetails({ action }: { action: AssistantAction }) {
  const t = useT().assistant
  const shown = useShownValue(action)
  const impact = actionImpact(action.impact)
  // A new generation drops the oldest ones: nothing is deleted with it.
  const impactLabel = DROPS.has(action.name) ? t.actionDroppedLabel : t.actionImpactLabel
  // The links can be many, and none is cut: the list scrolls.
  const scrolls = action.name === 'set_diagram_code_links'
  const list = (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px] empty:hidden">
      {actionRows(action).map((row, index) => (
        // Links repeat their label.
        <React.Fragment key={`${row.label}-${String(index)}`}>
          <dt className="text-muted-foreground">{t.actionRows[row.label]}</dt>
          <dd
            className={cn(
              'm-0 min-w-0 break-words whitespace-pre-wrap text-foreground',
              // A mission can run to pages, and all of it is what the agent is told: it scrolls.
              row.label === 'mission' && 'max-h-40 overflow-y-auto',
            )}
            // A region that scrolls is reached by keyboard.
            tabIndex={row.label === 'mission' ? 0 : undefined}
          >
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
          <dt className="text-muted-foreground">{impactLabel}</dt>
          <dd className="m-0 min-w-0 text-foreground">
            {impact.map(({ kind, count }) => t.actionImpact[kind](count)).join(', ')}
          </dd>
        </>
      )}
    </dl>
  )
  // The scroll area's viewport is reached by keyboard.
  return scrolls ? (
    <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-80">{list}</ScrollArea>
  ) : (
    list
  )
}

/** The tab of the project an accepted action's link opens, when it is not the first one. */
function resultTab(name: string): 'code' | 'design' | null {
  const domain = actionDomain(name)
  return domain === 'code' || domain === 'design' ? domain : null
}

/** Actions that create something and push the oldest out: nothing is deleted "with" them. */
const DROPS = new Set(['generate_files', 'import_code_map_from_github'])

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
      <ActionDetails action={action} />
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
      {action.status === 'accepted' && action.result && (
        <ResultLink result={action.result} tab={resultTab(action.name)} />
      )}
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

import {
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleIcon,
  CircleMinusIcon,
  CirclePauseIcon,
  ListChecksIcon,
} from 'lucide-react'
import * as React from 'react'

import { AgentAvatar } from '@/components/ui/agent-avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { type AiPlan, type AiPlanStep, planProgress } from '@/lib/ai'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function StepIcon({ status, active }: { status: AiPlanStep['status']; active: boolean }) {
  if (status === 'running')
    return active ? (
      <Spinner className="size-4 text-primary-text" aria-hidden role="presentation" />
    ) : (
      <CirclePauseIcon className="size-4 text-muted-foreground" aria-hidden />
    )
  if (status === 'done') return <CheckCircle2Icon className="size-4 text-success" aria-hidden />
  if (status === 'failed')
    return <CircleAlertIcon className="size-4 text-destructive" aria-hidden />
  if (status === 'skipped')
    return <CircleMinusIcon className="size-4 text-muted-foreground" aria-hidden />
  return <CircleIcon className="size-4 text-border-strong" aria-hidden />
}

function AgentPlan({
  plan,
  label,
  active = true,
  announce = false,
  defaultOpen = true,
  avatar,
  className,
}: {
  /** The plan: `{ title?, steps: [{ id, title, status, detail? }] }` — read untrusted data with `readPlan`. */
  plan: AiPlan
  /** The heading line; defaults to the plan's `title`, then "Plan". */
  label?: React.ReactNode
  /** The agent is still working: a running step spins. When false (stopped, finished), it shows as stopped. */
  active?: boolean
  /** Announce the step in progress through its own live region. Leave off inside a live region (Chat's log). */
  announce?: boolean
  defaultOpen?: boolean
  /**
   * The agent working the plan, as an animated AgentAvatar in place of the list icon: it thinks on
   * a step, smiles when every step is done and frowns on a failure. `{ seed: agent.id }`.
   */
  avatar?: Pick<
    React.ComponentProps<typeof AgentAvatar>,
    'variant' | 'seed' | 'tone' | 'eyes' | 'shape'
  >
  className?: string
}) {
  const t = useCoreloomI18n().messages.ai.plan
  const labelId = React.useId()
  const [open, setOpen] = React.useState(defaultOpen)
  const { finished, total, current, failed, complete } = planProgress(plan)
  const name = label ?? plan.title ?? t.title
  const announcement = failed
    ? t.failed(failed.title)
    : complete
      ? t.complete
      : current && active
        ? t.now(current.title)
        : ''

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="agent-plan"
      className={cn('rounded-md border border-border bg-card text-[13px]', className)}
    >
      {announce && (
        <p className="sr-only" role="status" aria-live="polite" aria-atomic>
          {announcement}
        </p>
      )}
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring">
        {avatar ? (
          <AgentAvatar
            {...avatar}
            state={failed ? 'error' : complete ? 'done' : current && active ? 'thinking' : 'idle'}
            size="xs"
            decorative
          />
        ) : (
          <ListChecksIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span id={labelId} className="min-w-0 flex-1 font-medium break-words text-foreground">
          {name}
        </span>
        <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
          {t.progress(finished, total)}
        </span>
        <ChevronRightIcon
          className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-base group-data-[state=open]:rotate-90"
          aria-hidden
        />
      </CollapsibleTrigger>
      <Progress
        value={total ? (finished / total) * 100 : 0}
        aria-labelledby={labelId}
        aria-valuetext={t.progress(finished, total)}
        className="mx-3 h-1 w-auto"
      />
      <CollapsibleContent>
        <ol
          aria-labelledby={labelId}
          className="m-0 flex list-none flex-col gap-0.5 px-3 pt-2 pb-2.5"
        >
          {plan.steps.map((step) => {
            const running = step.status === 'running'
            return (
              <li
                key={step.id}
                aria-current={running ? 'step' : undefined}
                data-status={step.status}
                className="flex items-start gap-2.5 rounded-sm py-1"
              >
                <span className="mt-px flex shrink-0">
                  <StepIcon status={step.status} active={active} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      'break-words',
                      running ? 'font-medium text-foreground' : 'text-fg-secondary',
                      (step.status === 'done' || step.status === 'skipped') &&
                        'text-muted-foreground',
                      step.status === 'skipped' && 'line-through',
                    )}
                  >
                    {step.title}
                    {/* Keyed by status: a change is a new node, so a surrounding log reads it out. */}
                    <span key={step.status} className="sr-only">
                      {' '}
                      ({running && !active ? t.stopped : t.states[step.status]})
                    </span>
                  </span>
                  {step.detail && (
                    <span
                      className={cn(
                        'text-[12.5px] break-words',
                        step.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {step.detail}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { AgentPlan }

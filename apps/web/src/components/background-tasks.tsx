'use client'

// Coreloom UI — BackgroundTasks (background-tasks block). An icon button for the app header that
// spins while long jobs the person launched (a refresh, a scan, an import) are queued or running,
// and a popover listing them, running first, then queued, then the ones that just ended. When a
// task finishes or fails it is announced, popover open or not. Tasks are data: poll your API and
// pass them in; `onDismiss` removes a finished one.
import { CircleCheckIcon, CircleXIcon, ClockIcon, ListChecksIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { NotificationBadge } from '@/components/ui/notification-badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { RelativeTime } from '@/components/ui/relative-time'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type BackgroundTaskStatus = 'queued' | 'running' | 'done' | 'failed'

interface BackgroundTask {
  id: string
  /** What the task is: "Catalog search". */
  label: string
  status: BackgroundTaskStatus
  /** A second line: a queue name, "attempt 2 of 3". */
  detail?: string
  /** When it started running (when it was queued, while queued). */
  startedAt?: Date | string
  /** When it ended, for done and failed. */
  finishedAt?: Date | string
  /** 0 to 100: a progress bar while running. */
  progress?: number
  /** Why it failed, shown as text. */
  error?: string
}

interface BackgroundTasksProps {
  tasks: BackgroundTask[]
  /** Controlled popover: open it when the person launches a task. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** When given, finished tasks get a dismiss button. */
  onDismiss?: (id: string) => void
  className?: string
}

const RANK: Record<BackgroundTaskStatus, number> = { running: 0, queued: 1, done: 2, failed: 2 }

const isActive = (task: BackgroundTask) => task.status === 'queued' || task.status === 'running'

function timeOf(date: Date | string | undefined) {
  const ms = date === undefined ? Number.NaN : new Date(date).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** Running first, then queued (both in the order given), then finished, most recent first. */
function sortBackgroundTasks(tasks: readonly BackgroundTask[]): BackgroundTask[] {
  return [...tasks].sort((a, b) => {
    const byStatus = RANK[a.status] - RANK[b.status]
    if (byStatus !== 0 || isActive(a)) return byStatus
    return timeOf(b.finishedAt ?? b.startedAt) - timeOf(a.finishedAt ?? a.startedAt)
  })
}

/** How many tasks are queued or running: the count on the trigger. */
function countActiveTasks(tasks: readonly BackgroundTask[]): number {
  return tasks.filter(isActive).length
}

/** The tasks that were queued or running in `previous` and are done or failed in `next`. */
function endedTasks(
  previous: readonly BackgroundTask[],
  next: readonly BackgroundTask[],
): BackgroundTask[] {
  const wasActive = new Set(previous.filter(isActive).map((task) => task.id))
  return next.filter((task) => !isActive(task) && wasActive.has(task.id))
}

function BackgroundTasks({
  tasks,
  open,
  defaultOpen,
  onOpenChange,
  onDismiss,
  className,
}: BackgroundTasksProps) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.backgroundTasks
  const active = countActiveTasks(tasks)
  const contentRef = React.useRef<HTMLDivElement>(null)

  // What just ended, said once, from the change of status between two renders.
  const [previous, setPrevious] = React.useState(tasks)
  const [announcement, setAnnouncement] = React.useState('')
  if (previous !== tasks) {
    setPrevious(tasks)
    const ended = endedTasks(previous, tasks)
    if (ended.length > 0)
      setAnnouncement(
        ended
          .map((task) =>
            task.status === 'failed' ? t.announceFailed(task.label) : t.announceDone(task.label),
          )
          .join(' '),
      )
  }

  return (
    <>
      <Popover open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={active ? t.triggerActive(formatNumber(active), active) : t.trigger}
            data-slot="background-tasks-trigger"
            className={cn('relative', className)}
          >
            <NotificationBadge count={active} tone="primary" label="">
              {active ? (
                <Spinner aria-hidden role="presentation" className="text-current" />
              ) : (
                <ListChecksIcon />
              )}
            </NotificationBadge>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          ref={contentRef}
          // Focus the panel, not the scrollable list (its ring would frame every row on open).
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
          className="w-[min(380px,calc(100vw-2rem))] p-0"
          aria-label={t.title}
        >
          <p className="m-0 border-b border-border px-4 py-3 font-display text-[15px] font-semibold text-foreground">
            {t.title}
          </p>
          {/* The viewport carries the height cap: on the root it would not scroll. */}
          <ScrollArea className="[&>[data-slot=scroll-area-viewport]]:max-h-[360px]">
            <BackgroundTaskList tasks={tasks} onDismiss={onDismiss} />
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {/* Outside the popover, so an outcome is heard while it is closed. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  )
}

/** The list on its own, sorted: for a page or a panel instead of the header's popover. */
function BackgroundTaskList({
  tasks,
  onDismiss,
  className,
}: Pick<BackgroundTasksProps, 'tasks' | 'onDismiss' | 'className'>) {
  const t = useCoreloomI18n().messages.backgroundTasks
  const listRef = React.useRef<HTMLDivElement>(null)

  if (tasks.length === 0)
    return (
      <p className={cn('m-0 px-4 py-10 text-center text-[13px] text-muted-foreground', className)}>
        {t.empty}
      </p>
    )

  return (
    <div ref={listRef} tabIndex={-1} className={cn('outline-none', className)}>
      <ul className="m-0 list-none p-2">
        {sortBackgroundTasks(tasks).map((task) => (
          <BackgroundTaskRow
            key={task.id}
            task={task}
            onDismiss={
              onDismiss &&
              (() => {
                onDismiss(task.id)
                // The row goes with its button: keep focus in the list (or its empty state).
                requestAnimationFrame(() => {
                  const list = listRef.current
                  if (list?.contains(document.activeElement) !== true) list?.focus()
                })
              })
            }
          />
        ))}
      </ul>
    </div>
  )
}

const ICON_TONE: Record<BackgroundTaskStatus, string> = {
  running: 'text-muted-foreground',
  queued: 'text-muted-foreground',
  done: 'text-success',
  failed: 'text-destructive',
}

function StatusIcon({ status }: { status: BackgroundTaskStatus }) {
  switch (status) {
    case 'running':
      return <Spinner aria-hidden role="presentation" className="text-current" />
    case 'queued':
      return <ClockIcon aria-hidden />
    case 'done':
      return <CircleCheckIcon aria-hidden />
    case 'failed':
      return <CircleXIcon aria-hidden />
  }
}

function BackgroundTaskRow({ task, onDismiss }: { task: BackgroundTask; onDismiss?: () => void }) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.backgroundTasks
  const when = task.finishedAt ?? task.startedAt
  const progress =
    task.status === 'running' && task.progress !== undefined
      ? Math.min(100, Math.max(0, task.progress))
      : undefined

  return (
    <li
      data-slot="background-task"
      data-status={task.status}
      className="flex items-start gap-3 rounded-md p-2"
    >
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary [&_svg]:size-4',
          ICON_TONE[task.status],
        )}
      >
        <StatusIcon status={task.status} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] leading-snug font-medium break-words text-foreground">
          {task.label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          <span
            className={cn(
              task.status === 'done' || task.status === 'failed'
                ? ICON_TONE[task.status]
                : undefined,
            )}
          >
            {t[task.status]}
          </span>
          {when !== undefined && (
            <>
              {' · '}
              <RelativeTime date={when} />
            </>
          )}
        </span>
        {!!task.detail && (
          <span className="text-[12px] leading-snug break-words text-muted-foreground">
            {task.detail}
          </span>
        )}
        {progress !== undefined && (
          <span className="mt-1 flex items-center gap-2">
            <Progress value={progress} aria-label={task.label} className="flex-1" />
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {new Intl.NumberFormat(locale, { style: 'percent' }).format(progress / 100)}
            </span>
          </span>
        )}
        {task.status === 'failed' && !!task.error && (
          <span className="text-[12px] leading-snug break-words text-destructive">
            {task.error}
          </span>
        )}
      </span>
      {onDismiss && !isActive(task) && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t.dismiss(task.label)}
          onClick={onDismiss}
        >
          <XIcon />
        </Button>
      )}
    </li>
  )
}

export {
  type BackgroundTask,
  BackgroundTaskList,
  BackgroundTasks,
  type BackgroundTasksProps,
  type BackgroundTaskStatus,
  countActiveTasks,
  endedTasks,
  sortBackgroundTasks,
}

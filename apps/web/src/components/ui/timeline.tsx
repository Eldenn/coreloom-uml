'use client'

// Coreloom UI — Timeline. What happened, in order: a ticket's history, a deployment's steps, an
// order's tracking, an audit log. Each event has a marker (an icon or a dot, tinted by its tone) on a
// line that joins them, a title, a time, an optional description and anything below it (a comment,
// a diff, a card).
//
//   <Timeline>
//     <TimelineItem icon={<GitMergeIcon />} tone="success" title="Merged into main"
//       time={<RelativeTime date={mergedAt} />} />
//   </Timeline>
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type TimelineTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const iconTones: Record<TimelineTone, string> = {
  neutral: 'border-border bg-secondary text-muted-foreground',
  primary: 'border-transparent bg-primary-subtle text-primary-text',
  success: 'border-transparent bg-success-subtle text-success',
  warning: 'border-transparent bg-warning-subtle text-warning',
  danger: 'border-transparent bg-destructive-subtle text-destructive',
  info: 'border-transparent bg-info-subtle text-info',
}

const dotTones: Record<TimelineTone, string> = {
  neutral: 'bg-border-strong',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
}

function Timeline({ className, 'aria-label': ariaLabel, ...props }: React.ComponentProps<'ol'>) {
  const t = useCoreloomI18n().messages.display.timeline
  return (
    <ol
      data-slot="timeline"
      aria-label={ariaLabel ?? (props['aria-labelledby'] ? undefined : t.label)}
      className={cn('m-0 flex list-none flex-col p-0', className)}
      {...props}
    />
  )
}

function TimelineItem({
  icon,
  tone = 'neutral',
  title,
  description,
  time,
  children,
  className,
  ...props
}: {
  /** A Lucide element or an Avatar. Without one, the marker is a dot. */
  icon?: React.ReactNode
  /** Tints the marker. The title must still say what happened: colour alone tells nothing. */
  tone?: TimelineTone
  title: React.ReactNode
  description?: React.ReactNode
  /** At the end of the title row: a RelativeTime, a date, a step's duration. */
  time?: React.ReactNode
  /** Below the description: a comment, a diff, a card, buttons. */
  children?: React.ReactNode
} & Omit<React.ComponentProps<'li'>, 'title'>) {
  const marker = icon ? 'icon' : 'dot'
  return (
    <li
      data-slot="timeline-item"
      data-marker={marker}
      data-tone={tone}
      className={cn(
        // The line runs from under this marker to the next item's marker; the last item has none.
        'relative flex gap-3 pb-6 last:pb-0',
        'before:absolute before:bottom-1 before:w-px before:bg-border last:before:hidden',
        marker === 'icon'
          ? 'before:top-10 before:left-[15.5px]'
          : 'before:top-6 before:left-[7.5px]',
        className,
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border [&_svg]:size-4',
            iconTones[tone],
          )}
        >
          {icon}
        </span>
      ) : (
        <span aria-hidden className="flex h-5 w-4 shrink-0 items-center justify-center">
          <span className={cn('size-2.5 rounded-full', dotTones[tone])} />
        </span>
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', marker === 'icon' && 'pt-1.5')}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="min-w-0 text-[14px] leading-snug text-foreground">{title}</span>
          {time ? (
            <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{time}</span>
          ) : null}
        </div>
        {description ? (
          <div className="text-[13px] leading-snug text-muted-foreground">{description}</div>
        ) : null}
        {children ? <div className="mt-2 min-w-0">{children}</div> : null}
      </div>
    </li>
  )
}

export { Timeline, TimelineItem, type TimelineTone }

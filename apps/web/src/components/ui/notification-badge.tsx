'use client'

// Coreloom UI — NotificationBadge. A count or a dot on the corner of an icon or an avatar: unread
// messages on a bell, items in a cart, someone online. It caps at "99+", hides at 0 (unless you
// ask), and adds the count in words for screen readers.
//
//   <Button variant="ghost" size="icon">
//     <span className="sr-only">Notifications</span>
//     <NotificationBadge count={unread}><BellIcon /></NotificationBadge>
//   </Button>
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type NotificationBadgeTone = 'danger' | 'primary' | 'success' | 'warning' | 'neutral'

const tones: Record<NotificationBadgeTone, string> = {
  danger: 'bg-destructive text-destructive-foreground',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-primary-foreground',
  warning: 'bg-warning text-primary-foreground',
  neutral: 'bg-fg-secondary text-background',
}

function NotificationBadge({
  count,
  max = 99,
  dot = false,
  showZero = false,
  tone = 'danger',
  placement = 'top-right',
  label,
  pulse = false,
  className,
  badgeClassName,
  children,
  ...props
}: {
  /** The number shown. Hidden at 0 unless `showZero`. */
  count?: number
  /** Above it, the badge shows "99+". */
  max?: number
  /** A dot without a number: something new, or a presence (online). */
  dot?: boolean
  showZero?: boolean
  tone?: NotificationBadgeTone
  /** The corner. bottom-right suits a presence dot on an avatar. */
  placement?: 'top-right' | 'bottom-right'
  /** Words for screen readers, replacing "3 unread" (or "New" for a dot). Pass "" for none. */
  label?: string
  /** A ring that pulses once in a while (not when people reduce motion). */
  pulse?: boolean
  className?: string
  badgeClassName?: string
  /** The icon, avatar or button the badge sits on. */
  children: React.ReactNode
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.utility.notificationBadge
  const hasCount = count !== undefined && (count > 0 || showZero)
  const visible = dot || hasCount
  const text = hasCount && !dot ? (count > max ? `${formatNumber(max)}+` : formatNumber(count)) : ''
  const spoken =
    label ?? (dot || count === undefined ? t.new : t.unread(formatNumber(count), count))
  return (
    <span
      data-slot="notification-badge"
      className={cn('relative inline-flex shrink-0', className)}
      {...props}
    >
      {children}
      {visible ? (
        <>
          <span
            data-slot="notification-badge-indicator"
            aria-hidden
            className={cn(
              'pointer-events-none absolute flex items-center justify-center rounded-full font-sans font-semibold tabular-nums ring-2 ring-background',
              dot ? 'size-2.5' : 'h-[18px] min-w-[18px] px-[5px] text-[10.5px] leading-none',
              // A number starts near the corner and grows to the right, so "99+" leaves the icon visible.
              placement === 'top-right'
                ? dot
                  ? 'top-0 right-0'
                  : '-top-1.5 left-[calc(100%-0.625rem)]'
                : dot
                  ? 'right-0 bottom-0'
                  : '-bottom-1.5 left-[calc(100%-0.625rem)]',
              tones[tone],
              badgeClassName,
            )}
          >
            {pulse ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-inherit opacity-60 motion-reduce:hidden" />
            ) : null}
            <span className="relative">{text}</span>
          </span>
          {spoken ? <span className="sr-only">{` ${spoken}`}</span> : null}
        </>
      ) : null}
    </span>
  )
}

export { NotificationBadge, type NotificationBadgeTone }

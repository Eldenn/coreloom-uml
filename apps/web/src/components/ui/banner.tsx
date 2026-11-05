import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type BannerTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger'

const tones: Record<BannerTone, string> = {
  neutral: 'border-border bg-secondary [&_[data-slot=banner-icon]]:text-muted-foreground',
  primary: 'border-primary/30 bg-primary-subtle [&_[data-slot=banner-icon]]:text-primary-text',
  info: 'border-info/30 bg-info-subtle [&_[data-slot=banner-icon]]:text-info',
  success: 'border-success/30 bg-success-subtle [&_[data-slot=banner-icon]]:text-success',
  warning: 'border-warning/30 bg-warning-subtle [&_[data-slot=banner-icon]]:text-warning',
  danger:
    'border-destructive/30 bg-destructive-subtle [&_[data-slot=banner-icon]]:text-destructive',
}

const icons: Record<BannerTone, React.ReactNode> = {
  neutral: <InfoIcon />,
  primary: <SparklesIcon />,
  info: <InfoIcon />,
  success: <CircleCheckIcon />,
  warning: <TriangleAlertIcon />,
  danger: <CircleAlertIcon />,
}

function Banner({
  tone = 'info',
  icon,
  title,
  action,
  onDismiss,
  floating = false,
  className,
  children,
  ...props
}: {
  tone?: BannerTone
  /** Replaces the tone's icon; pass null for none. */
  icon?: React.ReactNode
  /** A few bold words before the message. */
  title?: React.ReactNode
  /** A Button or a link, at the end. */
  action?: React.ReactNode
  /** Shows a close button. Remember the dismissal yourself (per person, per message). */
  onDismiss?: () => void
  /** A rounded card with a margin instead of a full-width bar. */
  floating?: boolean
  children?: React.ReactNode
} & Omit<React.ComponentProps<'div'>, 'title'>) {
  const t = useCoreloomI18n().messages.display.banner
  const shownIcon = icon === undefined ? icons[tone] : icon
  return (
    <div
      data-slot="banner"
      data-tone={tone}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-2.5 font-sans text-[13.5px] leading-snug text-foreground sm:items-center',
        floating ? 'rounded-lg border shadow-sm' : 'border-b',
        tones[tone],
        className,
      )}
      {...props}
    >
      {shownIcon ? (
        <span
          data-slot="banner-icon"
          aria-hidden
          className="mt-px flex shrink-0 sm:mt-0 [&_svg]:size-[18px]"
        >
          {shownIcon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-x-4 gap-y-2 sm:flex-row sm:items-center">
        <p className="m-0 min-w-0 flex-1">
          {title ? <strong className="mr-1.5 font-semibold">{title}</strong> : null}
          {children}
        </p>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={t.dismiss}
          className="-my-1 -mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm text-fg-secondary outline-none hover:bg-background/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4"
          onClick={onDismiss}
        >
          <XIcon />
        </button>
      ) : null}
    </div>
  )
}

export { Banner, type BannerTone }

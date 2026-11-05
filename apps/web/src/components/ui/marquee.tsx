import { PauseIcon, PlayIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Marquee({
  direction = 'left',
  duration = 30,
  gap = '2rem',
  pauseOnHover = true,
  fade = true,
  controls = true,
  paused: pausedProp,
  onPausedChange,
  className,
  style,
  children,
  ...props
}: {
  /** Where the items go: left (default), right, up or down. */
  direction?: 'left' | 'right' | 'up' | 'down'
  /** Seconds for the items to go round once: higher is slower. */
  duration?: number
  /** Space between items, as a CSS length. */
  gap?: string
  /** Stops while the pointer is over it or focus is inside. */
  pauseOnHover?: boolean
  /** Fades the items out at both edges. */
  fade?: boolean
  /** Shows a pause / play button (keep it unless something else on the page pauses it). */
  controls?: boolean
  /** Controlled pause state. */
  paused?: boolean
  onPausedChange?: (paused: boolean) => void
} & React.ComponentProps<'div'>) {
  const t = useCoreloomI18n().messages.motion
  const [pausedState, setPausedState] = React.useState(false)
  const paused = pausedProp ?? pausedState
  const vertical = direction === 'up' || direction === 'down'
  const reverse = direction === 'right' || direction === 'down'

  const track = cn(
    'flex shrink-0 justify-around gap-(--marquee-gap)',
    vertical ? 'min-h-full animate-marquee-y flex-col' : 'min-w-full animate-marquee',
    reverse && '[animation-direction:reverse]',
    paused && '[animation-play-state:paused]',
    pauseOnHover &&
      'group-focus-within/track:[animation-play-state:paused] group-hover/track:[animation-play-state:paused]',
  )
  const edge = vertical ? 'to bottom' : 'to right'

  return (
    <div
      data-slot="marquee"
      data-state={paused ? 'paused' : 'running'}
      className={cn('flex gap-2', vertical ? 'flex-col' : 'items-center', className)}
      style={
        {
          '--marquee-gap': gap,
          '--marquee-duration': `${duration}s`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      <div
        className={cn(
          'group/track flex min-w-0 flex-1 gap-(--marquee-gap) overflow-hidden',
          vertical && 'min-h-0 flex-col',
        )}
        style={
          fade
            ? {
                maskImage: `linear-gradient(${edge}, transparent, #000 8%, #000 92%, transparent)`,
              }
            : undefined
        }
      >
        <div className={track}>{children}</div>
        {/* The second copy closes the loop; it is hidden from screen readers and from Tab. */}
        <div className={track} aria-hidden inert>
          {children}
        </div>
      </div>
      {controls && (
        <button
          type="button"
          aria-label={paused ? t.play : t.pause}
          aria-pressed={paused}
          onClick={() => {
            setPausedState(!paused)
            onPausedChange?.(!paused)
          }}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors duration-fast outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:hidden [&_svg]:size-3.5',
            vertical && 'self-end',
          )}
        >
          {paused ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
        </button>
      )}
    </div>
  )
}

export { Marquee }

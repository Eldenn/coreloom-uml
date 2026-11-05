import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function PageProgress({
  loading,
  label,
  className,
  ...props
}: {
  /** A page is loading. */
  loading: boolean
  /** The bar's name for screen readers (default "Loading the page"). */
  label?: string
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const t = useCoreloomI18n().messages.motion
  // done: the last load just ended, the bar runs to the end and fades; idle: nothing to show.
  const [phase, setPhase] = React.useState<'idle' | 'loading' | 'done'>(
    loading ? 'loading' : 'idle',
  )
  const [wasLoading, setWasLoading] = React.useState(loading)
  if (wasLoading !== loading) {
    setWasLoading(loading)
    setPhase(loading ? 'loading' : 'done')
  }
  React.useEffect(() => {
    if (phase !== 'done') return
    const timer = setTimeout(() => {
      setPhase('idle')
    }, 500)
    return () => {
      clearTimeout(timer)
    }
  }, [phase])
  if (phase === 'idle') return null
  return (
    <div
      data-slot="page-progress"
      data-state={phase}
      role="progressbar"
      aria-label={label ?? t.pageProgress}
      aria-busy={phase === 'loading'}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-(--z-toast) h-0.5 overflow-hidden',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full origin-left bg-primary shadow-glow',
          phase === 'loading'
            ? 'animate-page-progress'
            : 'scale-x-100 opacity-0 transition-[scale,opacity] [transition-delay:0ms,200ms] duration-slow ease-out',
        )}
      />
    </div>
  )
}

export { PageProgress }

import { CircleAlert, Loader2 } from 'lucide-react'
import type * as React from 'react'

import { cn } from '../../lib/utils'
import { Card } from '../ui/card'

type AuthStatusVariant = 'loading' | 'error'

type AuthStatusProps = {
  variant?: AuthStatusVariant
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

/**
 * Full-card feedback for a transient auth step: signing in, redirecting to the
 * identity provider, or a terminal error with a recovery action. Shares the
 * `AuthCard` footprint (`w-full max-w-sm`) so it drops into the same centered
 * layout the auth pages use.
 */
function AuthStatus({
  variant = 'loading',
  title,
  description,
  action,
  className,
}: AuthStatusProps) {
  const isError = variant === 'error'

  return (
    <Card
      data-slot="auth-status"
      className={cn('w-full max-w-sm items-center gap-5 px-6 text-center', className)}
    >
      <div
        role={isError ? 'alert' : 'status'}
        aria-live={isError ? 'assertive' : 'polite'}
        className="flex flex-col items-center gap-5"
      >
        {isError ? (
          <span className="flex size-11 items-center justify-center rounded-full bg-destructive/10">
            <CircleAlert className="size-[22px] text-destructive" aria-hidden />
          </span>
        ) : (
          <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
        )}
        <div className="flex flex-col gap-1.5">
          <h1 className="text-base leading-none font-semibold">{title}</h1>
          {description ? (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex w-full flex-col gap-2">{action}</div> : null}
      </div>
    </Card>
  )
}

export type { AuthStatusProps, AuthStatusVariant }
export { AuthStatus }

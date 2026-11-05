'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '../../lib/utils'

export const LOGTO_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000

export interface CodeExpiryTimerProps {
  expiresAt: number
  durationMs?: number
  onExpire?: () => void
  renderLabel: (state: { remainingSeconds: number; isExpired: boolean }) => ReactNode
  className?: string
}

function remainingMsFor(expiresAt: number): number {
  return Math.max(0, expiresAt - Date.now())
}

export function CodeExpiryTimer({
  expiresAt,
  durationMs = LOGTO_VERIFICATION_CODE_TTL_MS,
  onExpire,
  renderLabel,
  className,
}: CodeExpiryTimerProps) {
  const [remainingMs, setRemainingMs] = useState(() => remainingMsFor(expiresAt))
  const expiredFiredRef = useRef(false)

  useEffect(() => {
    expiredFiredRef.current = false
    setRemainingMs(remainingMsFor(expiresAt))
    const interval = setInterval(() => {
      setRemainingMs(remainingMsFor(expiresAt))
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  useEffect(() => {
    if (remainingMs === 0 && !expiredFiredRef.current) {
      expiredFiredRef.current = true
      onExpire?.()
    }
  }, [remainingMs, onExpire])

  const remainingSeconds = Math.ceil(remainingMs / 1000)
  const isExpired = remainingMs === 0
  const isWarning = remainingSeconds <= 60
  const percent = durationMs > 0 ? (remainingMs / durationMs) * 100 : 0

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-linear',
            isWarning ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cn('text-sm', isWarning ? 'text-destructive' : 'text-muted-foreground')}
      >
        {renderLabel({ remainingSeconds, isExpired })}
      </p>
    </div>
  )
}

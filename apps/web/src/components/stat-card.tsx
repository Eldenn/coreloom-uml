import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkline } from '@/components/ui/sparkline'
import { cn } from '@/lib/utils'

function StatCard({
  label,
  value,
  delta,
  trend = 'up',
  good = trend === 'up',
  note,
  sparkline,
  className,
}: {
  label: string
  value: React.ReactNode
  /** The change, as displayed: "+12.4%", "−8s". */
  delta?: string
  trend?: 'up' | 'down'
  /** Whether this change is good news (colors the badge). Defaults to "up is good". */
  good?: boolean
  /** Context for the change: "last 30 days". */
  note?: string
  /** Recent values, oldest first: drawn as a small area chart under the value. */
  sparkline?: readonly number[]
  className?: string
}) {
  const Icon = trend === 'up' ? TrendingUpIcon : TrendingDownIcon
  return (
    <Card className={cn('gap-2', className)}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-display text-[28px] tracking-[-0.02em] tabular-nums">
          {value}
        </CardTitle>
        {delta && (
          <CardAction>
            <Badge variant={good ? 'success' : 'warning'}>
              <Icon />
              {delta}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {sparkline && sparkline.length > 0 && (
        <Sparkline data={sparkline} type="area" height={36} aria-label={label} className="my-1" />
      )}
      {note && <div className="text-[12px] text-muted-foreground">{note}</div>}
    </Card>
  )
}

export { StatCard }

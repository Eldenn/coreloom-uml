import type * as React from 'react'

import { cn } from '../../lib/utils'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '../ui/card'

type AuthCardProps = {
  logo?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

function AuthCard({ logo, title, description, children, footer, className }: AuthCardProps) {
  return (
    <Card data-slot="auth-card" className={cn('w-full max-w-sm', className)}>
      <CardHeader>
        {logo ? <div className="mb-2 flex justify-center">{logo}</div> : null}
        {title ? (
          <h1 data-slot="card-title" className={cn('leading-none font-semibold')}>
            {title}
          </h1>
        ) : null}
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer ? <CardFooter>{footer}</CardFooter> : null}
    </Card>
  )
}

export type { AuthCardProps }
export { AuthCard }

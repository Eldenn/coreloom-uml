'use client'

import { Loader2Icon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const t = useCoreloomI18n().messages
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label={t.common.loading}
      className={cn(
        'size-4 animate-spin text-muted-foreground motion-reduce:animate-[spin_1.5s_linear_infinite]',
        className,
      )}
      {...props}
    />
  )
}

export { Spinner }

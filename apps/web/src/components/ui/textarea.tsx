import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-[86px] resize-y py-[11px] leading-normal',
        'w-full min-w-0 rounded-md border border-input bg-inset px-[13px] font-sans text-[14px] text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none selection:bg-primary-subtle placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle aria-invalid:focus-visible:ring-destructive/70',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }

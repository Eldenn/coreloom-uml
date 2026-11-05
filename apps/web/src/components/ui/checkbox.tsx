import { CheckIcon, MinusIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer group/checkbox size-5 shrink-0 cursor-pointer rounded-sm border border-border-strong bg-inset text-primary-foreground transition-[background-color,box-shadow] duration-fast ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=indeterminate]:border-transparent data-[state=indeterminate]:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon
          strokeWidth={3}
          className="size-[13px] group-data-[state=indeterminate]/checkbox:hidden"
        />
        <MinusIcon
          strokeWidth={3}
          className="hidden size-[13px] group-data-[state=indeterminate]/checkbox:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }

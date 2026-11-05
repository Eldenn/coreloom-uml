'use client'

import { Switch as SwitchPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-pill border transition-[background-color,box-shadow] duration-base ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55',
        'data-[size=default]:h-[25px] data-[size=default]:w-[42px] data-[size=sm]:h-[21px] data-[size=sm]:w-[34px]',
        'data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=unchecked]:border-border-strong data-[state=unchecked]:bg-accent',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block translate-x-[2px] rounded-full transition-[translate,background-color] duration-base ease-spring',
          'group-data-[size=default]/switch:size-[17px] group-data-[size=sm]/switch:size-[13px]',
          'data-[state=checked]:bg-primary-foreground data-[state=unchecked]:bg-white data-[state=unchecked]:shadow-sm',
          'group-data-[size=default]/switch:data-[state=checked]:translate-x-[21px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[17px]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

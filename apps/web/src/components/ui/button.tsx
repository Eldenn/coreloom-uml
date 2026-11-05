import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent font-sans leading-none font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-base ease-out outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-secondary disabled:text-faint-foreground disabled:shadow-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-glow active:bg-primary-press',
        secondary: 'border-border bg-secondary text-secondary-foreground hover:bg-accent',
        outline: 'border-border bg-transparent text-foreground hover:bg-accent',
        ghost: 'bg-transparent text-fg-secondary hover:bg-accent hover:text-foreground',
        destructive:
          'border-destructive/40 bg-transparent text-destructive hover:bg-destructive-subtle',
        link: 'h-auto px-0 text-primary-text underline-offset-4 hover:underline active:translate-y-0',
      },
      size: {
        default: 'h-9 px-[18px] text-[14px] has-[>svg]:px-4',
        sm: "h-[27px] gap-1.5 px-3 text-[13px] has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-[15px]",
        lg: "h-[41px] gap-[9px] px-6 text-[15px] has-[>svg]:px-5 [&_svg:not([class*='size-'])]:size-[18px]",
        icon: 'size-9',
        'icon-sm': 'size-[27px]',
        'icon-lg': "size-[41px] [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

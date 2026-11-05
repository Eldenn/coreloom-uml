import { Loader2 } from 'lucide-react'
import type * as React from 'react'

import { cn } from '../../lib/utils'
import { Button } from '../ui/button'

type SignInButtonProps = React.ComponentProps<typeof Button> & {
  isLoading?: boolean
  icon?: React.ReactNode
  fullWidth?: boolean
}

function SignInButton({
  className,
  children,
  icon,
  isLoading = false,
  fullWidth = false,
  disabled,
  ...props
}: SignInButtonProps) {
  return (
    <Button
      data-slot="sign-in-button"
      className={cn(fullWidth && 'w-full', className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </Button>
  )
}

export type { SignInButtonProps }
export { SignInButton }

import { describePolicy, type PasswordContext, validatePassword } from '@coreloom-uml/auth-policy'
import { Check, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type PasswordRequirementsProps = {
  password: string
  context?: PasswordContext
  className?: string
}

function PasswordRequirements({ password, context, className }: PasswordRequirementsProps) {
  const failed = new Set(validatePassword(password, context))
  return (
    <ul data-slot="password-requirements" className={cn('flex flex-col gap-1 text-sm', className)}>
      {describePolicy().map((requirement) => {
        const met = password.length > 0 && !failed.has(requirement.code)
        return (
          <li
            key={requirement.code}
            data-met={met}
            className={cn(
              'flex items-center gap-2',
              met ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {met ? (
              <Check className="size-4 shrink-0" aria-hidden />
            ) : (
              <X className="size-4 shrink-0" aria-hidden />
            )}
            <span>{requirement.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

export type { PasswordRequirementsProps }
export { PasswordRequirements }

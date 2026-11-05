import { type PasswordContext, validatePassword } from '@coreloom-uml/auth-policy'
import { Loader2 } from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'

import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { PasswordRequirements } from './password-requirements'

type LoginFormValues = { email: string; password: string }

type LoginFormProps = {
  onSubmit: (values: LoginFormValues) => void
  isLoading?: boolean
  error?: string | null
  social?: React.ReactNode
  forgotPassword?: React.ReactNode
  footer?: React.ReactNode
  defaultEmail?: string
  emailLabel?: string
  passwordLabel?: string
  submitLabel?: string
  enforcePasswordPolicy?: boolean
  className?: string
}

function LoginForm({
  onSubmit,
  isLoading = false,
  error = null,
  social,
  forgotPassword,
  footer,
  defaultEmail,
  emailLabel = 'Email',
  passwordLabel = 'Password',
  submitLabel = 'Sign in',
  enforcePasswordPolicy = false,
  className,
}: LoginFormProps) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [password, setPassword] = useState('')
  const passwordContext: PasswordContext = { email }
  const passwordBlocked =
    enforcePasswordPolicy &&
    (password.length === 0 || validatePassword(password, passwordContext).length > 0)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    onSubmit({ email, password })
  }

  return (
    <form
      data-slot="login-form"
      className={cn('flex flex-col gap-6', className)}
      onSubmit={handleSubmit}
    >
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="login-email">{emailLabel}</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isLoading}
          defaultValue={defaultEmail}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">{passwordLabel}</Label>
          {forgotPassword}
        </div>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete={enforcePasswordPolicy ? 'new-password' : 'current-password'}
          required
          disabled={isLoading}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {enforcePasswordPolicy ? (
        <PasswordRequirements password={password} context={passwordContext} />
      ) : null}
      <Button type="submit" className="w-full" disabled={isLoading || passwordBlocked}>
        {isLoading ? <Loader2 className="animate-spin" /> : null}
        {submitLabel}
      </Button>
      {social ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <Separator className="flex-1" />
          </div>
          {social}
        </div>
      ) : null}
      {footer}
    </form>
  )
}

export type { LoginFormProps, LoginFormValues }
export { LoginForm }

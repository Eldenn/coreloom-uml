'use client'

// Coreloom UI — LoginForm (auth block). Email + password sign-in with optional OAuth buttons.
// Built on @coreloom/form (TanStack Form): fields validate on change once left, and the button
// shows a spinner while your `onSubmit` promise runs. Pass the API's answer back as `error`.
import * as React from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { en, type Messages, useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

interface OAuthProvider {
  id: string
  label: string
  icon?: React.ReactNode
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Checks an email field; messages come from the i18n `auth` group. */
function validateEmail(
  value: string,
  t: Pick<Messages['auth'], 'emailRequired' | 'emailInvalid'> = en.auth,
) {
  if (!value.trim()) return t.emailRequired
  if (!EMAIL.test(value.trim())) return t.emailInvalid
  return undefined
}

function LoginForm({
  onSubmit,
  onProvider,
  providers = [],
  pending = false,
  error,
  defaultEmail = '',
  forgotPasswordHref = '#',
  signUpHref,
  title,
  description,
  className,
}: {
  /** Called with valid values. Return a promise to keep the button busy until it settles. */
  onSubmit: (values: { email: string; password: string }) => unknown
  onProvider?: (providerId: string) => void
  /** OAuth buttons shown above the form ("Continue with GitHub"). */
  providers?: OAuthProvider[]
  /** Busy state you control (e.g. during an OAuth redirect); the form's own submission also counts. */
  pending?: boolean
  /** Shown above the fields, e.g. "Wrong email or password." */
  error?: React.ReactNode
  defaultEmail?: string
  forgotPasswordHref?: string
  signUpHref?: string
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  const t = useCoreloomI18n().messages
  const l = t.auth.login
  const form = useAppForm({
    defaultValues: { email: defaultEmail, password: '' },
    onSubmit: async ({ value }) => {
      await onSubmit({ email: value.email.trim(), password: value.password })
    },
  })

  return (
    <Card className={cn('gap-5 px-6 py-6', className)}>
      <CardHeader className="text-center">
        <CardTitle asChild className="m-0 text-[22px]">
          <h1>{title ?? l.title}</h1>
        </CardTitle>
        <CardDescription className="text-[14px]">{description ?? l.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            {providers.length > 0 && (
              <>
                <div className="flex flex-col gap-2">
                  {providers.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => onProvider?.(p.id)}
                      disabled={pending}
                    >
                      {p.icon}
                      {p.label}
                    </Button>
                  ))}
                </div>
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card [&_[data-slot=separator]]:bg-border">
                  {t.auth.or}
                </FieldSeparator>
              </>
            )}
            {!!error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form.AppField
              name="email"
              validators={{ onChange: ({ value }) => validateEmail(value, t.auth) }}
            >
              {(field) => (
                <field.TextField
                  label={l.email}
                  type="email"
                  autoComplete="email"
                  placeholder={t.auth.emailPlaceholder}
                />
              )}
            </form.AppField>
            <form.AppField
              name="password"
              validators={{ onChange: ({ value }) => (value ? undefined : l.passwordRequired) }}
            >
              {(field) => (
                <field.TextField
                  label={l.password}
                  type="password"
                  autoComplete="current-password"
                  labelAction={
                    <AppLink
                      href={forgotPasswordHref}
                      className="text-[13px] text-primary-text underline-offset-4 hover:underline"
                    >
                      {l.forgotPassword}
                    </AppLink>
                  }
                />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full" pending={pending} pendingLabel={l.submitting}>
                {l.submit}
              </form.SubmitButton>
            </form.AppForm>
            {signUpHref && (
              <p className="m-0 text-center text-[13px] text-muted-foreground">
                {l.noAccount}{' '}
                <AppLink
                  href={signUpHref}
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  {l.signUp}
                </AppLink>
              </p>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export { LoginForm, type OAuthProvider, validateEmail }

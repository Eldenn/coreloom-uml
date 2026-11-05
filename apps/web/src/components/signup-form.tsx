'use client'

// Coreloom UI — SignupForm (auth block). Name, email and password, with the terms underneath.
// Built on @coreloom/form (TanStack Form), like LoginForm.
import * as React from 'react'

import { type OAuthProvider, validateEmail } from '@/components/login-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, FieldSeparator } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

function SignupForm({
  onSubmit,
  onProvider,
  providers = [],
  pending = false,
  error,
  minPasswordLength = 8,
  signInHref,
  terms,
  title,
  description,
  className,
}: {
  /** Called with valid values. Return a promise to keep the button busy until it settles. */
  onSubmit: (values: { name: string; email: string; password: string }) => unknown
  onProvider?: (providerId: string) => void
  providers?: OAuthProvider[]
  pending?: boolean
  error?: React.ReactNode
  minPasswordLength?: number
  signInHref?: string
  /** Small print under the button, e.g. links to your terms and privacy policy. */
  terms?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  const t = useCoreloomI18n().messages
  const l = t.auth.signup
  const form = useAppForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
      await onSubmit({
        name: value.name.trim(),
        email: value.email.trim(),
        password: value.password,
      })
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
              name="name"
              validators={{ onChange: ({ value }) => (value.trim() ? undefined : l.nameRequired) }}
            >
              {(field) => <field.TextField label={l.name} autoComplete="name" />}
            </form.AppField>
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
              validators={{
                onChange: ({ value }) =>
                  value.length < minPasswordLength
                    ? l.passwordTooShort(minPasswordLength)
                    : undefined,
              }}
            >
              {(field) => (
                <field.TextField
                  label={l.password}
                  type="password"
                  autoComplete="new-password"
                  description={l.passwordHint(minPasswordLength)}
                />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full" pending={pending} pendingLabel={l.submitting}>
                {l.submit}
              </form.SubmitButton>
            </form.AppForm>
            {!!terms && (
              <p className="m-0 text-center text-[12px] leading-[1.5] text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground">
                {terms}
              </p>
            )}
            {signInHref && (
              <p className="m-0 text-center text-[13px] text-muted-foreground">
                {l.haveAccount}{' '}
                <AppLink
                  href={signInHref}
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  {l.signIn}
                </AppLink>
              </p>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export { SignupForm }

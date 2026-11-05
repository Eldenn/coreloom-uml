'use client'

// Coreloom UI — password reset (auth block), in two steps:
//   ForgotPasswordForm: asks for the account's email, then says a link is on its way. It never says
//                       whether the account exists, so the form can't be used to probe emails.
//   ResetPasswordForm:  the page the link opens — a new password, typed twice.
// Built on @coreloom/form (TanStack Form), like LoginForm.
import * as React from 'react'

import { validateEmail } from '@/components/login-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

const linkClass = 'font-medium text-primary-text underline-offset-4 hover:underline'

function ForgotPasswordForm({
  onSubmit,
  pending = false,
  error,
  defaultEmail = '',
  signInHref,
  title,
  description,
  className,
}: {
  /** Called with a valid email. Return a promise to keep the button busy; return `false` to stay on the form (pass `error`). */
  onSubmit: (email: string) => unknown
  pending?: boolean
  error?: React.ReactNode
  defaultEmail?: string
  /** "Back to sign in", on the form and on the confirmation. */
  signInHref?: string
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  const t = useCoreloomI18n().messages
  const l = t.auth.forgot
  const [sentTo, setSentTo] = React.useState<string>()
  const heading = React.useRef<HTMLHeadingElement>(null)
  const form = useAppForm({
    defaultValues: { email: defaultEmail },
    onSubmit: async ({ value }) => {
      const email = value.email.trim()
      if ((await onSubmit(email)) !== false) setSentTo(email)
    },
  })

  // The card changes under the user's focus: move it to the new heading so it is announced.
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    heading.current?.focus()
  }, [sentTo])

  const back = signInHref && (
    <p className="m-0 text-center text-[13px] text-muted-foreground">
      <AppLink href={signInHref} className={linkClass}>
        {l.backToSignIn}
      </AppLink>
    </p>
  )

  return (
    <Card className={cn('gap-5 px-6 py-6', className)}>
      <CardHeader className="text-center">
        <CardTitle asChild className="m-0 text-[22px] outline-none">
          <h1 ref={heading} tabIndex={-1}>
            {sentTo ? l.sentTitle : (title ?? l.title)}
          </h1>
        </CardTitle>
        <CardDescription className="text-[14px]">
          {sentTo ? l.sentTo(sentTo) : (description ?? l.description)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentTo ? (
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setSentTo(undefined)
              }}
            >
              {l.otherEmail}
            </Button>
            {back}
          </div>
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup className="gap-4">
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
              <form.AppForm>
                <form.SubmitButton className="w-full" pending={pending} pendingLabel={l.submitting}>
                  {l.submit}
                </form.SubmitButton>
              </form.AppForm>
              {back}
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function ResetPasswordForm({
  onSubmit,
  pending = false,
  error,
  minPasswordLength = 8,
  email,
  title,
  description,
  className,
}: {
  /** Called with the new password once both fields match. Return a promise to keep the button busy. */
  onSubmit: (password: string) => unknown
  pending?: boolean
  /** E.g. "This link has expired." */
  error?: React.ReactNode
  minPasswordLength?: number
  /** The account's email, if the link tells you: sent as a hidden username field so password managers file the new password under it. */
  email?: string
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  const t = useCoreloomI18n().messages
  const l = t.auth.reset
  const form = useAppForm({
    defaultValues: { password: '', confirm: '' },
    onSubmit: async ({ value }) => {
      await onSubmit(value.password)
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
          {email && (
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              hidden
            />
          )}
          <FieldGroup className="gap-4">
            {!!error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <form.AppField
              name="password"
              validators={{
                onChange: ({ value }) =>
                  value.length < minPasswordLength
                    ? t.auth.signup.passwordTooShort(minPasswordLength)
                    : undefined,
              }}
            >
              {(field) => (
                <field.TextField
                  label={l.password}
                  type="password"
                  autoComplete="new-password"
                  description={t.auth.signup.passwordHint(minPasswordLength)}
                />
              )}
            </form.AppField>
            <form.AppField
              name="confirm"
              validators={{
                onChangeListenTo: ['password'],
                onChange: ({ value, fieldApi }) =>
                  value === fieldApi.form.getFieldValue('password') ? undefined : l.mismatch,
              }}
            >
              {(field) => (
                <field.TextField label={l.confirm} type="password" autoComplete="new-password" />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full" pending={pending} pendingLabel={l.submitting}>
                {l.submit}
              </form.SubmitButton>
            </form.AppForm>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

export { ForgotPasswordForm, ResetPasswordForm }

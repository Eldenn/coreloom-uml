'use client'

// Coreloom UI — VerifyForm (auth block). Enter the 6-digit code sent by email or SMS.
// Built on @coreloom/form (TanStack Form, OTPField): submits by itself once the last digit is in;
// the button stays for those who wait.
import { REGEXP_ONLY_DIGITS } from 'input-otp'
import * as React from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppForm } from '@/components/ui/form'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function VerifyForm({
  onSubmit,
  onResend,
  destination,
  pending = false,
  error,
  resendIn = 30,
  title,
  className,
}: {
  /** Called with the 6 digits. Return a promise to keep the form busy until it settles. */
  onSubmit: (code: string) => unknown
  onResend?: () => void
  /** Where the code went, masked: "m•••@coreloom.dev". */
  destination?: string
  pending?: boolean
  error?: React.ReactNode
  /** Seconds before "Resend code" is offered again. */
  resendIn?: number
  title?: React.ReactNode
  className?: string
}) {
  const t = useCoreloomI18n().messages
  const l = t.auth.verify
  const [wait, setWait] = React.useState(resendIn)
  const form = useAppForm({
    defaultValues: { code: '' },
    onSubmit: async ({ value }) => {
      await onSubmit(value.code)
    },
  })

  React.useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => {
      setWait((w) => w - 1)
    }, 1000)
    return () => {
      clearTimeout(t)
    }
  }, [wait])

  return (
    <Card className={cn('gap-5 px-6 py-6', className)}>
      <CardHeader className="text-center">
        <CardTitle asChild className="m-0 text-[22px]">
          <h1>{title ?? l.title}</h1>
        </CardTitle>
        <CardDescription className="text-[14px]">
          {destination ? l.sentTo(destination) : l.sent}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col items-center gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          {!!error && (
            <Alert variant="destructive" className="w-full">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form.AppField
            name="code"
            validators={{
              onChange: ({ value }) => (value.length === 6 ? undefined : l.codeRequired),
            }}
          >
            {(field) => (
              <field.OTPField
                label={l.code}
                hideLabel
                pattern={REGEXP_ONLY_DIGITS}
                autoFocus
                submitOnComplete
                disabled={pending}
                className="w-auto items-center"
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton className="w-full" pending={pending} pendingLabel={l.submitting}>
              {l.submit}
            </form.SubmitButton>
          </form.AppForm>
          {onResend && (
            <p className="m-0 text-center text-[13px] text-muted-foreground">
              {l.notReceived}{' '}
              {wait > 0 ? (
                <span className="font-mono text-[12px]">{l.resendIn(wait)}</span>
              ) : (
                <button
                  type="button"
                  className="cursor-pointer font-medium text-primary-text underline-offset-4 hover:underline"
                  onClick={() => {
                    onResend()
                    setWait(resendIn)
                  }}
                >
                  {l.resend}
                </button>
              )}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

export { VerifyForm }

// Settings, "LLM provider", for a subscription kind: connect a ChatGPT subscription (a code to type
// on OpenAI's page) or a Claude subscription (the `claude` binary's page, then paste its code), see
// that it is connected, disconnect it. The server holds the connection; this browser holds nothing.
// It sits inside the provider section's own <form>, so the Claude code form renders no <form> of
// its own: its button and Enter call `handleSubmit` directly.
import { ExternalLinkIcon, LogInIcon, UnplugIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import {
  type CodexAttempt,
  type ProviderInfo,
  useCodexAttempt,
  useDisconnectSubscription,
  useStartClaudeLogin,
  useStartCodexAttempt,
  useSubmitClaudeCode,
} from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

export function SubscriptionConnection({ provider }: { provider: ProviderInfo }) {
  const t = useT()
  const SignIn = provider.kind === 'openai-codex' ? ChatgptSignIn : ClaudeSignIn
  return (
    <Field>
      <FieldLabel>{t.llm.subscription.label}</FieldLabel>
      {provider.connected ? <Connected provider={provider} /> : <SignIn />}
      {provider.kind === 'claude-code' && (
        <FieldDescription>{t.llm.subscription.claudeUsage}</FieldDescription>
      )}
    </Field>
  )
}

function Connected({ provider }: { provider: ProviderInfo }) {
  const t = useT()
  const disconnect = useDisconnectSubscription()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="success">{t.llm.subscription.connected}</Badge>
      <span className="text-sm text-muted-foreground">{t.llm.subscription.connectedHint}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disconnect.isPending}
        aria-busy={disconnect.isPending || undefined}
        onClick={() => {
          disconnect.mutate(provider.kind, {
            onSuccess: () => toast.success(t.llm.subscription.disconnected),
            onError: () => toast.error(t.llm.failed),
          })
        }}
      >
        {disconnect.isPending ? <Spinner className="text-current" /> : <UnplugIcon />}
        {t.llm.subscription.disconnect}
      </Button>
    </div>
  )
}

function SignInLink({ href }: { href: string }) {
  const t = useT()
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noreferrer noopener">
        <ExternalLinkIcon /> {t.llm.subscription.openPage}
      </a>
    </Button>
  )
}

function StartButton({
  label,
  pending,
  onClick,
}: {
  label: string
  pending: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={onClick}
    >
      {pending ? <Spinner className="text-current" /> : <LogInIcon />}
      {label}
    </Button>
  )
}

function ChatgptSignIn() {
  const t = useT()
  const start = useStartCodexAttempt()
  const [attempt, setAttempt] = React.useState<CodexAttempt | null>(null)
  const status = useCodexAttempt(attempt)
  const begin = () => {
    setAttempt(null)
    start.mutate(undefined, {
      onSuccess: setAttempt,
      onError: () => toast.error(t.llm.subscription.startFailed),
    })
  }
  // An attempt the server no longer knows (an error) ended like an expired one.
  const ended = status.isError || status.data === 'expired' || status.data === 'denied'
  // The status region stays mounted from the start, so its first text is announced.
  const region = (
    <div role="status">
      {attempt &&
        (ended ? (
          <Alert variant="destructive" role="none">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              {status.data === 'denied'
                ? t.llm.subscription.chatgptDenied
                : t.llm.subscription.chatgptExpired}
              <Button type="button" variant="outline" size="sm" onClick={begin}>
                {t.llm.subscription.retry}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {t.llm.subscription.waiting}
          </p>
        ))}
    </div>
  )
  if (!attempt) {
    return (
      <div className="flex flex-col gap-3">
        <StartButton
          label={t.llm.subscription.chatgptConnect}
          pending={start.isPending}
          onClick={begin}
        />
        {region}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.llm.subscription.chatgptSteps}</p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{t.llm.subscription.chatgptCode}</span>
        <code className="rounded-md border border-border bg-secondary px-3 py-1 font-mono text-lg tracking-widest text-foreground">
          {attempt.userCode}
        </code>
        <SignInLink href={attempt.verificationUrl} />
      </div>
      {region}
    </div>
  )
}

function ClaudeSignIn() {
  const t = useT()
  const start = useStartClaudeLogin()
  const submit = useSubmitClaudeCode()
  const [url, setUrl] = React.useState<string | null>(null)
  const form = useAppForm({
    defaultValues: { code: '' },
    validators: {
      onSubmit: z.object({ code: z.string().trim().min(1, t.llm.subscription.claudeCodeRequired) }),
    },
    onSubmit: ({ value }) => {
      submit.mutate(value.code.trim(), {
        onSuccess: (body) => {
          if (!body.connected) {
            setUrl(null)
            toast.error(t.llm.subscription.claudeFailed)
          }
        },
        onError: () => {
          setUrl(null)
          toast.error(t.llm.subscription.claudeFailed)
        },
      })
    },
  })
  const begin = () => {
    setUrl(null)
    form.reset()
    start.mutate(undefined, {
      onSuccess: (body) => setUrl(body.url),
      onError: () => toast.error(t.llm.subscription.startFailed),
    })
  }
  if (!url) {
    return (
      <StartButton
        label={t.llm.subscription.claudeConnect}
        pending={start.isPending}
        onClick={begin}
      />
    )
  }
  const finish = () => {
    void form.handleSubmit()
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.llm.subscription.claudeSteps}</p>
      <SignInLink href={url} />
      <form.AppField name="code">
        {(field) => (
          <field.TextField
            label={t.llm.subscription.claudeCode}
            className="max-w-md"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(event) => {
              // Enter finishes the sign-in, not the provider section's form around it.
              if (event.key === 'Enter') {
                event.preventDefault()
                finish()
              }
            }}
          />
        )}
      </form.AppField>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={submit.isPending}
        aria-busy={submit.isPending || undefined}
        onClick={finish}
      >
        {submit.isPending && <Spinner className="text-current" />}
        {t.llm.subscription.claudeSubmit}
      </Button>
    </div>
  )
}

import { KeyRoundIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { RelativeTime } from '@/components/ui/relative-time'
import { SecretValue } from '@/components/ui/secret-value'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ApiKey {
  id: string
  name: string
  /** The start of the key, shown in clear ("cl_live_"). */
  prefix: string
  /** The last characters of the key, to tell keys apart. */
  last4: string
  /** Scope values (see `scopes`). */
  scopes?: string[]
  createdAt: Date
  lastUsedAt?: Date
  expiresAt?: Date
  /** Who created it. */
  createdBy?: string
}

interface ApiKeyScope {
  value: string
  label: string
  description?: string
}

interface ApiKeyInput {
  name: string
  scopes: string[]
  /** Days until it expires; null for a key that never does. */
  expiresInDays: number | null
}

const EXPIRIES = ['30', '90', '365', 'never'] as const

function CreateKeyDialog({
  scopes,
  onCreate,
}: {
  scopes: ApiKeyScope[]
  onCreate: (input: ApiKeyInput) => { secret: string } | Promise<{ secret: string }>
}) {
  const { messages } = useCoreloomI18n()
  const t = messages.apiKeys
  const [open, setOpen] = React.useState(false)
  const [secret, setSecret] = React.useState<string | null>(null)
  const form = useAppForm({
    defaultValues: { name: '', scopes: scopes.map((s) => s.value), expiry: '90' },
    validators: {
      onChange: z.object({
        name: z.string().trim().min(1, t.nameRequired),
        scopes: scopes.length ? z.array(z.string()).min(1, t.scopesRequired) : z.array(z.string()),
        expiry: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      const created = await onCreate({
        name: value.name.trim(),
        scopes: value.scopes,
        expiresInDays: value.expiry === 'never' ? null : Number(value.expiry),
      })
      setSecret(created.secret)
    },
  })
  React.useEffect(() => {
    if (open) form.reset()
  }, [open, form])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // A new opening starts from the form, not from the last key's secret.
        if (next) setSecret(null)
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t.create}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {secret === null ? (
          <form
            noValidate
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              void form.handleSubmit()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.createTitle}</DialogTitle>
              <DialogDescription>{t.createDescription}</DialogDescription>
            </DialogHeader>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label={t.name}
                  placeholder={t.namePlaceholder}
                  autoComplete="off"
                />
              )}
            </form.AppField>
            {scopes.length > 0 && (
              <form.AppField name="scopes">
                {(field) => <field.CheckboxGroupField label={t.scopes} options={scopes} />}
              </form.AppField>
            )}
            <form.AppField name="expiry">
              {(field) => (
                <field.SelectField
                  label={t.expiry}
                  options={EXPIRIES.map((v) => ({
                    value: v,
                    label: v === 'never' ? t.never : t.days(Number(v)),
                  }))}
                />
              )}
            </form.AppField>
            <DialogFooter>
              <form.AppForm>
                <form.SubmitButton pendingLabel={t.creating}>{t.create}</form.SubmitButton>
              </form.AppForm>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>{t.createdTitle}</DialogTitle>
              <DialogDescription>{t.createdDescription}</DialogDescription>
            </DialogHeader>
            <Banner tone="warning">{t.copyNow}</Banner>
            <SecretValue value={secret} defaultRevealed label={t.secretName} className="w-full" />
            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false)
                }}
              >
                {t.done}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ApiKeys({
  keys,
  scopes = [],
  onCreate,
  onRevoke,
  title,
  description,
  className,
}: {
  keys: ApiKey[]
  /** What a key can do. Leave it empty for keys with full access (no scope picker). */
  scopes?: ApiKeyScope[]
  /** Creates the key and returns its secret, shown once. A rejected promise keeps the form open. */
  onCreate?: (input: ApiKeyInput) => { secret: string } | Promise<{ secret: string }>
  onRevoke?: (id: string) => unknown
  title?: React.ReactNode
  description?: React.ReactNode
  className?: string
}) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.apiKeys
  const date = (d: Date) =>
    d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  const scopeLabel = (v: string) => scopes.find((s) => s.value === v)?.label ?? v

  return (
    <Card className={cn('gap-0 p-0', className)}>
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle asChild>
          <h2 className="m-0">{title ?? t.title}</h2>
        </CardTitle>
        <CardDescription>{description ?? t.description}</CardDescription>
        {onCreate && (
          <CardAction>
            <CreateKeyDialog scopes={scopes} onCreate={onCreate} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-5">
              <KeyRoundIcon aria-hidden />
            </span>
            <p className="m-0 text-[14px] font-medium text-foreground">{t.empty}</p>
            <p className="m-0 text-[13px] text-muted-foreground">{t.emptyHint}</p>
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {keys.map((k) => (
              <li
                key={k.id}
                data-slot="api-key"
                className="relative flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-border-subtle px-5 py-4 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5 max-sm:pr-8">
                  <span className="truncate text-[14px] font-medium text-foreground">{k.name}</span>
                  <code className="w-fit rounded-sm bg-inset px-1.5 py-0.5 font-mono text-[12.5px] text-fg-secondary">
                    <span className="sr-only">{t.keyEnding(k.last4)}</span>
                    <span aria-hidden>
                      {k.prefix}
                      {'•'.repeat(8)}
                      {k.last4}
                    </span>
                  </code>
                  {!!k.scopes?.length && (
                    <ul aria-label={t.scopes} className="m-0 flex list-none flex-wrap gap-1 p-0">
                      {k.scopes.map((s) => (
                        <li key={s}>
                          <Badge variant="secondary">{scopeLabel(s)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] sm:w-56">
                  <dt className="text-muted-foreground">{t.created}</dt>
                  <dd className="m-0 text-fg-secondary">
                    {date(k.createdAt)}
                    {k.createdBy ? ` · ${k.createdBy}` : ''}
                  </dd>
                  <dt className="text-muted-foreground">{t.lastUsed}</dt>
                  <dd className="m-0 text-fg-secondary">
                    {k.lastUsedAt ? <RelativeTime date={k.lastUsedAt} /> : t.neverUsed}
                  </dd>
                  <dt className="text-muted-foreground">{t.expires}</dt>
                  <dd className="m-0 text-fg-secondary">
                    {k.expiresAt ? date(k.expiresAt) : t.never}
                  </dd>
                </dl>
                {onRevoke && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.revoke(k.name)}
                        className="max-sm:absolute max-sm:top-3 max-sm:right-3"
                      >
                        <Trash2Icon />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t.revokeTitle(k.name)}</AlertDialogTitle>
                        <AlertDialogDescription>{t.revokeDescription}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{messages.common.cancel}</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void onRevoke(k.id)}
                        >
                          {t.revokeConfirm}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export { type ApiKey, type ApiKeyInput, ApiKeys, type ApiKeyScope }

import { AlertTriangleIcon } from 'lucide-react'
import * as React from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import type { SubmitButton } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** What SettingsSection needs from a `useAppForm` instance. */
interface SectionForm {
  handleSubmit: () => unknown
  AppForm: React.ComponentType<{ children?: React.ReactNode }>
  SubmitButton: React.ComponentType<React.ComponentProps<typeof SubmitButton>>
}

function SettingsSection({
  title,
  description,
  children,
  footer,
  onSubmit,
  form,
  pending = false,
  submitLabel,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  /** Note at the left of the footer ("Changes apply to new deployments."). */
  footer?: React.ReactNode
  /** A useAppForm instance: the section becomes its <form>, with its SubmitButton as Save. */
  form?: SectionForm
  /** Plain-form alternative to `form`: receives the FormData. Leave both out for sections that apply instantly. */
  onSubmit?: (data: FormData) => unknown
  pending?: boolean
  submitLabel?: string
  className?: string
}) {
  const t = useCoreloomI18n().messages
  submitLabel ??= t.settings.save
  const body = (
    <>
      <div className="flex flex-col gap-1 px-5 pt-5">
        <h2 className="m-0 font-display text-[17px] leading-[1.3] font-semibold text-foreground">
          {title}
        </h2>
        {!!description && (
          <p className="m-0 text-[13px] leading-[1.55] text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-4 px-5 pt-4 pb-5">{children}</div>
      {(!!form || !!onSubmit || !!footer) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface px-5 py-3">
          <span className="text-[13px] text-muted-foreground">{footer}</span>
          {form ? (
            <form.AppForm>
              <form.SubmitButton size="sm" pending={pending}>
                {submitLabel}
              </form.SubmitButton>
            </form.AppForm>
          ) : (
            onSubmit && (
              <Button type="submit" size="sm" disabled={pending}>
                {pending && <Spinner className="text-current" />}
                {submitLabel}
              </Button>
            )
          )}
        </div>
      )}
    </>
  )
  const frame = cn('overflow-hidden rounded-lg border border-border bg-card shadow-md', className)
  if (form)
    return (
      <form
        noValidate
        className={frame}
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        {body}
      </form>
    )
  return onSubmit ? (
    <form
      className={frame}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(new FormData(e.currentTarget))
      }}
    >
      {body}
    </form>
  ) : (
    <section className={frame}>{body}</section>
  )
}

/** A label and description on the left, a control (Switch, Select, Button) on the right. */
function SettingsRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: React.ReactNode
  description?: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border-subtle pb-4 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="text-[14px] font-medium text-foreground">
          {label}
        </label>
        {!!description && <span className="text-[13px] text-muted-foreground">{description}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/**
 * The irreversible action at the end of a settings page. Confirming asks the user to type
 * the resource's name.
 */
function DangerZone({
  title,
  description,
  actionLabel,
  confirmTitle,
  confirmDescription,
  resourceName,
  onConfirm,
  pending = false,
}: {
  title?: React.ReactNode
  description: React.ReactNode
  /** The verb and object: "Delete project". */
  actionLabel: string
  confirmTitle: React.ReactNode
  confirmDescription: React.ReactNode
  /** Typed to confirm. */
  resourceName: string
  onConfirm: () => unknown
  pending?: boolean
}) {
  const t = useCoreloomI18n().messages
  title ??= t.settings.dangerZone
  const [typed, setTyped] = React.useState('')
  const confirmId = React.useId()
  return (
    <section className="overflow-hidden rounded-lg border border-destructive/40 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 font-display text-[17px] leading-[1.3] font-semibold text-foreground">
            {title}
          </h2>
          <p className="m-0 max-w-[56ch] text-[13px] leading-[1.55] text-muted-foreground">
            {description}
          </p>
        </div>
        <AlertDialog
          onOpenChange={() => {
            setTyped('')
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">{actionLabel}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia>
                <AlertTriangleIcon />
              </AlertDialogMedia>
              <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor={confirmId}>{t.settings.typeToConfirm(resourceName)}</FieldLabel>
              <Input
                id={confirmId}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value)
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <FieldDescription>{t.settings.cannotUndo}</FieldDescription>
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={typed !== resourceName || pending}
                onClick={() => onConfirm()}
              >
                {pending && <Spinner className="text-current" />}
                {actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  )
}

export { DangerZone, SettingsRow, SettingsSection }

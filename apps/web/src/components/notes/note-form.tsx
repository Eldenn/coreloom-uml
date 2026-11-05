import { Button, Input, Label } from '@coreloom-uml/ui'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { getErrorMessage } from '../../lib/client'

export type NoteFormValues = { title: string; body: string }

type NoteFormProps = {
  defaultValues?: NoteFormValues
  submitLabel: string
  onSubmit: (values: NoteFormValues) => Promise<void>
  onCancel: () => void
}

/** Shared create/edit form for a note — React Hook Form, mirrors `components/account/*`. */
export function NoteForm({ defaultValues, submitLabel, onSubmit, onCancel }: NoteFormProps) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NoteFormValues>({
    defaultValues: defaultValues ?? { title: '', body: '' },
  })

  async function submit(values: NoteFormValues) {
    try {
      await onSubmit(values)
    } catch (err) {
      setError('root', { message: getErrorMessage(err, t('notes:form.error')) })
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(submit)}>
      {errors.root ? (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="note-title">{t('notes:fields.title')}</Label>
        <Input
          id="note-title"
          disabled={isSubmitting}
          aria-invalid={errors.title ? true : undefined}
          {...register('title', { required: t('notes:form.titleRequired') })}
        />
        {errors.title ? <p className="text-destructive text-xs">{errors.title.message}</p> : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note-body">{t('notes:fields.body')}</Label>
        <textarea
          id="note-body"
          rows={8}
          disabled={isSubmitting}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          {...register('body')}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onCancel}>
          {t('notes:form.cancel')}
        </Button>
      </div>
    </form>
  )
}

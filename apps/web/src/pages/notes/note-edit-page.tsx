import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NoteForm, type NoteFormValues } from '../../components/notes/note-form'
import { useNote, useUpdateNote } from './use-notes'

export function NoteEditPage() {
  const { t } = useTranslation()
  const { id } = useParams({ from: '/_authed/notes/$id_/edit' })
  const navigate = useNavigate()
  const { data, isPending, isError } = useNote(id)
  const updateNote = useUpdateNote(id)

  async function handleSubmit(values: NoteFormValues) {
    await updateNote.mutateAsync(values)
    navigate({ to: '/notes/$id', params: { id } })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-10">
      <h1 className="font-semibold text-xl">{t('notes:form.editTitle')}</h1>

      {isPending ? <p className="text-muted-foreground text-sm">{t('notes:loading')}</p> : null}
      {isError ? <p className="text-destructive text-sm">{t('notes:detail.notFound')}</p> : null}

      {data ? (
        <NoteForm
          defaultValues={{ title: data.note.title, body: data.note.body }}
          submitLabel={t('notes:form.save')}
          onSubmit={handleSubmit}
          onCancel={() => navigate({ to: '/notes/$id', params: { id } })}
        />
      ) : null}
    </div>
  )
}

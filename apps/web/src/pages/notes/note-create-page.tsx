import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { NoteForm, type NoteFormValues } from '../../components/notes/note-form'
import { useCreateNote } from './use-notes'

export function NoteCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createNote = useCreateNote()

  async function handleSubmit(values: NoteFormValues) {
    const { note } = await createNote.mutateAsync(values)
    navigate({ to: '/notes/$id', params: { id: String(note.id) } })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-10">
      <h1 className="font-semibold text-xl">{t('notes:form.createTitle')}</h1>
      <NoteForm
        submitLabel={t('notes:form.create')}
        onSubmit={handleSubmit}
        onCancel={() => navigate({ to: '/notes' })}
      />
    </div>
  )
}

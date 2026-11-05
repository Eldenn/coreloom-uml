import { Button } from '@coreloom-uml/ui'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useDeleteNote, useNote } from './use-notes'

export function NoteDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams({ from: '/_authed/notes/$id' })
  const navigate = useNavigate()
  const { data, isPending, isError } = useNote(id)
  const deleteNote = useDeleteNote()

  async function handleDelete() {
    if (!window.confirm(t('notes:detail.deleteConfirm'))) return
    await deleteNote.mutateAsync(id)
    navigate({ to: '/notes' })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-10">
      <Link to="/notes" className="text-muted-foreground text-sm underline underline-offset-4">
        {t('notes:backToList')}
      </Link>

      {isPending ? <p className="text-muted-foreground text-sm">{t('notes:loading')}</p> : null}
      {isError ? <p className="text-destructive text-sm">{t('notes:detail.notFound')}</p> : null}

      {data ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-semibold text-xl">{data.note.title}</h1>
            <div className="flex shrink-0 gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/notes/$id/edit" params={{ id: String(data.note.id) }}>
                  {t('notes:detail.edit')}
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={deleteNote.isPending}
                onClick={handleDelete}
              >
                {t('notes:detail.delete')}
              </Button>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm">{data.note.body}</p>
        </>
      ) : null}
    </div>
  )
}

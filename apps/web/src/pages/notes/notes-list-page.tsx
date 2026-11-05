import { Button } from '@coreloom-uml/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotesList } from './use-notes'

const PER_PAGE = 10

export function NotesListPage() {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isPending, isError } = useNotesList(page, PER_PAGE)

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-xl">{t('notes:title')}</h1>
        <Button asChild size="sm">
          <Link to="/notes/new">{t('notes:new')}</Link>
        </Button>
      </div>

      {isPending ? <p className="text-muted-foreground text-sm">{t('notes:loading')}</p> : null}
      {isError ? <p className="text-destructive text-sm">{t('notes:loadError')}</p> : null}

      {data && data.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6">
          <p className="text-muted-foreground text-sm">{t('notes:empty')}</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/notes/new">{t('notes:createFirst')}</Link>
          </Button>
        </div>
      ) : null}

      {data && data.data.length > 0 ? (
        <>
          <ul className="flex flex-col divide-y rounded-md border">
            {data.data.map((note) => (
              <li key={note.id}>
                <Link
                  to="/notes/$id"
                  params={{ id: String(note.id) }}
                  className="flex flex-col gap-1 p-3 hover:bg-muted"
                >
                  <span className="font-medium text-sm">{note.title}</span>
                  <span className="line-clamp-1 text-muted-foreground text-xs">{note.body}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('notes:pager.previous')}
            </Button>
            <span className="text-muted-foreground">
              {t('notes:pager.page', { page: data.meta.page, lastPage: data.meta.lastPage })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= data.meta.lastPage}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('notes:pager.next')}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

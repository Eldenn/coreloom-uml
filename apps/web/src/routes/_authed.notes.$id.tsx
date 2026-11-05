import { createFileRoute } from '@tanstack/react-router'
import { NoteDetailPage } from '../pages/notes/note-detail-page'

export const Route = createFileRoute('/_authed/notes/$id')({
  component: NoteDetailPage,
})

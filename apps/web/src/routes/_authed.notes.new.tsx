import { createFileRoute } from '@tanstack/react-router'
import { NoteCreatePage } from '../pages/notes/note-create-page'

export const Route = createFileRoute('/_authed/notes/new')({
  component: NoteCreatePage,
})

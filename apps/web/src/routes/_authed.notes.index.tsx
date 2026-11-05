import { createFileRoute } from '@tanstack/react-router'
import { NotesListPage } from '../pages/notes/notes-list-page'

export const Route = createFileRoute('/_authed/notes/')({
  component: NotesListPage,
})

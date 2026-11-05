import { createFileRoute } from '@tanstack/react-router'
import { NoteEditPage } from '../pages/notes/note-edit-page'

export const Route = createFileRoute('/_authed/notes/$id_/edit')({
  component: NoteEditPage,
})

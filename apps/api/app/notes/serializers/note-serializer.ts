import type Note from '#app/notes/models/note'
import type { NoteOutput } from '#app/notes/validators/notes-output'

export function serializeNote(note: Note): NoteOutput {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    body: note.body,
    createdAt: note.createdAt.toISO() ?? '',
    updatedAt: note.updatedAt.toISO() ?? '',
  }
}

import type { Paginated } from '#app/shared/pagination/paginate'

/**
 * JSON-serialized shape of a note, as sent to clients. Single source of truth
 * for the public note shape — `serializeNote` returns this and the Tuyau client
 * infers its `Note` type from the controller responses that use it, so
 * `DateTime` columns are narrowed to their wire type (ISO string) here.
 */
export type NoteOutput = {
  id: number
  userId: number
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

/** Shape returned by `GET /notes` — composed from the shared pagination type. */
export type NotesListOutput = Paginated<NoteOutput>

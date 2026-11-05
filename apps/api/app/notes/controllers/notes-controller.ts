import type { HttpContext } from '@adonisjs/core/http'
import Note from '#app/notes/models/note'
import { serializeNote } from '#app/notes/serializers/note-serializer'
import { createNoteInput, listNotesInput, updateNoteInput } from '#app/notes/validators/notes-input'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * Reference CRUD controller for a user-owned resource. Every action is scoped to
 * the signed-in user: `index` filters by `userId`, and `show`/`update`/`destroy`
 * load by id then gate on `assertOwner` — a note that is not yours reads as a
 * 404, never a 403.
 */
export default class NotesController {
  async index({ request, auth, response }: HttpContext) {
    const { page, perPage } = await request.validateUsing(listNotesInput)
    const user = auth.getUserOrFail()

    const query = Note.query().where('userId', user.id).orderBy('id', 'desc')

    return response.ok(await paginate(query, { page, perPage }, serializeNote))
  }

  async store({ request, auth, response }: HttpContext) {
    const data = await request.validateUsing(createNoteInput)
    const user = auth.getUserOrFail()

    const note = await Note.create({ ...data, userId: user.id })

    return response.created({ note: serializeNote(note) })
  }

  async show({ params, auth, response }: HttpContext) {
    const note = await Note.find(params.id)
    const user = auth.getUserOrFail()

    if (!note || !assertOwner(note, user)) {
      return response.notFound({ error: { message: 'Note not found' } })
    }

    return response.ok({ note: serializeNote(note) })
  }

  async update({ params, request, auth, response }: HttpContext) {
    const note = await Note.find(params.id)
    const user = auth.getUserOrFail()

    if (!note || !assertOwner(note, user)) {
      return response.notFound({ error: { message: 'Note not found' } })
    }

    const { title, body } = await request.validateUsing(updateNoteInput)
    if (title !== undefined) note.title = title
    if (body !== undefined) note.body = body
    await note.save()

    return response.ok({ note: serializeNote(note) })
  }

  async destroy({ params, auth, response }: HttpContext) {
    const note = await Note.find(params.id)
    const user = auth.getUserOrFail()

    if (!note || !assertOwner(note, user)) {
      return response.notFound({ error: { message: 'Note not found' } })
    }

    await note.delete()

    return response.noContent()
  }
}

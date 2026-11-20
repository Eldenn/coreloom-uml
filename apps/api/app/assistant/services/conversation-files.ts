import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'
import drive from '@adonisjs/drive/services/main'
import {
  ASSISTANT_FILE_MAX_LENGTH,
  type ConversationFileContext,
  FILE_DIGEST_MAX_LENGTH,
  FILE_PASSAGE_LENGTH,
  FILE_PASSAGES_MAX_LENGTH,
  type FilePart,
  type FilePassageText,
  findPassages,
} from '@coreloom-uml/llm'
import { ASSISTANT_FILES_STORAGE_FOLDER } from '#app/assistant/constants/assistant'
import AssistantFile from '#app/assistant/models/assistant-file'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/*
 * The files of an assistant conversation. The text is gzipped in Drive and read on demand (the
 * read tools, the passages of a call without tools); prompts carry a file's name and summaries
 * only. A file's text is never logged, traced, answered or put in a column.
 */

/** A character takes at most four bytes in UTF-8: what inflating a stored text may produce. */
const INFLATED_MAX_BYTES = FILE_DIGEST_MAX_LENGTH * 4

/** Stores a file's text and its row; the object is deleted again when the row cannot be written. */
export async function storeConversationFile(input: {
  conversationId: number
  userId: number
  name: string
  content: string
  parts: FilePart[]
}): Promise<AssistantFile> {
  const key = `${ASSISTANT_FILES_STORAGE_FOLDER}/${input.conversationId}/${randomUUID()}.txt.gz`
  const disk = drive.use()
  await disk.put(key, await gzipAsync(input.content), { contentType: 'application/gzip' })
  try {
    return await AssistantFile.create({
      conversationId: input.conversationId,
      userId: input.userId,
      name: input.name,
      chars: input.content.length,
      storageKey: key,
      parts: input.parts,
    })
  } catch (error) {
    await disk.delete(key).catch(() => {})
    throw error
  }
}

/** Deletes stored texts; one already gone is not an error (the row is the source of truth). */
export async function deleteConversationFileTexts(keys: readonly string[]): Promise<void> {
  const disk = drive.use()
  await Promise.all(keys.map((key) => disk.delete(key).catch(() => {})))
}

export const FILE_NOT_FOUND = { error: { message: 'File not found' } } as const

/** The file `fileId` of the conversation, or null: callers answer 404. */
export function findConversationFile(
  conversationId: number,
  fileId: number,
): Promise<AssistantFile | null> {
  return AssistantFile.query().where('id', fileId).where('conversationId', conversationId).first()
}

/**
 * The file a message attaches, as that message carries it: whole when it is short enough
 * (`ASSISTANT_FILE_MAX_LENGTH`), else null and it is read through its summaries and passages.
 */
export async function wholeFile(
  file: AssistantFile | null,
  read: (file: AssistantFile) => Promise<string>,
): Promise<{ name: string; content: string } | null> {
  if (!file || file.chars > ASSISTANT_FILE_MAX_LENGTH) return null
  return { name: file.name, content: await read(file) }
}

/** The files of a conversation, oldest first. */
export function conversationFiles(conversationId: number): Promise<AssistantFile[]> {
  return AssistantFile.query().where('conversationId', conversationId).orderBy('id', 'asc')
}

/** The files as every prompt shows them: name and summaries, never the text. */
export function filesContext(files: readonly AssistantFile[]): ConversationFileContext[] {
  return files.map(({ id, name, chars, parts }) => ({ id, name, chars, parts }))
}

/** Reads texts from Drive, each at most once for the one reader (a request). */
export function fileTextReader(): (file: AssistantFile) => Promise<string> {
  const texts = new Map<number, Promise<string>>()
  return (file) => {
    let text = texts.get(file.id)
    if (!text) {
      text = drive
        .use()
        .getBytes(file.storageKey)
        .then((bytes) => gunzipAsync(bytes, { maxOutputLength: INFLATED_MAX_BYTES }))
        .then((inflated) => inflated.toString('utf8'))
      texts.set(file.id, text)
    }
    return text
  }
}

/**
 * The passages of `files` a request is about, found by its words, best first, all of them within
 * `FILE_PASSAGES_MAX_LENGTH`: what a call without tools reads of the files beyond their summaries.
 */
export async function filePassages(
  files: readonly AssistantFile[],
  query: string,
  read = fileTextReader(),
): Promise<FilePassageText[]> {
  if (files.length === 0) return []
  const texts = await Promise.all(
    files.map(async (file) => ({ id: file.id, text: await read(file) })),
  )
  const found = findPassages(texts, query, {
    limit: Math.floor(FILE_PASSAGES_MAX_LENGTH / FILE_PASSAGE_LENGTH),
  })
  return found.map(({ id, start, end }) => ({
    fileId: id,
    start,
    end,
    text: (texts.find((text) => text.id === id)?.text ?? '').slice(start, end),
  }))
}

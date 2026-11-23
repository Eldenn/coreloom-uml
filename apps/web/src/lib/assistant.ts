// Query and mutation hooks for the assistant: the account's conversations, and the messages and
// view changes that are about one architecture (the pattern of src/lib/query.ts). Model calls (a message, continuing a conversation) send the user's provider in
// the body, like src/lib/llm-provider.ts, and wait as long as the API bounds them.
import { useChat } from '@ai-sdk/react'
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import * as React from 'react'

import { agentConfigKeys } from '@/lib/agent-configs'
import { architectureKeys } from '@/lib/architectures'
import { actionDomain } from '@/lib/assistant-actions'
import type { ChangeAction } from '@/lib/assistant-changes'
import {
  type AssistantChatMessage,
  createAssistantChat,
  draftOf,
  sendChat,
  stopChat,
} from '@/lib/assistant-chat'
import type { AssistantPage, PointedPart, sentContext } from '@/lib/assistant-subject'
import { apiBaseUrl, client, TuyauError } from '@/lib/client'
import { codeReviewKeys } from '@/lib/code-reviews'
import { useFeature } from '@/lib/feature-flags'
import { githubKeys } from '@/lib/github'
import { MODEL_CALL, type StoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'
import { useLocale, useT } from '@/lib/locale'
import { projectKeys } from '@/lib/projects'

export type { AutosaveControl, BudgetLevel, ChangeAction } from '@/lib/assistant-changes'
export { applyChange, budgetLevel, viewTooLarge } from '@/lib/assistant-changes'

/** The account's conversations; a message about an architecture goes through `about`. */
const api = client.api.assistant
const about = client.api.architectures.assistant

const CONVERSATIONS_PER_PAGE = 50

export type ConversationSummary = Awaited<
  ReturnType<typeof api.conversations.index>
>['data'][number]
export type ConversationDetail = Awaited<ReturnType<typeof api.conversations.show>>
export type AssistantMessage = ConversationDetail['messages'][number]
export type ProposedChange = NonNullable<AssistantMessage['changes']>[number]
export type MessageProposals = NonNullable<AssistantMessage['proposals']>
/** A change to the account's work the assistant proposed, for the owner to accept or reject. */
export type AssistantAction = NonNullable<AssistantMessage['actions']>[number]
/** What a plain message answers: the stored exchange, or a handoff. */
type ChatOutput = Awaited<ReturnType<typeof api.messages.store>>
/** Where the server sends a plain message instead of answering it. */
export type AssistantHandoff = NonNullable<ChatOutput['handoff']>
export type AssistantChat = ReturnType<typeof createAssistantChat<ChatOutput>>

export const assistantKeys = {
  all: ['assistant'] as const,
  list: ['assistant', 'list'] as const,
  conversation: (conversationId: number) => ['assistant', 'conversation', conversationId] as const,
  context: (
    architectureId: number,
    conversationId: number,
    selection: ViewSelection,
    versions: number[],
  ) => ['assistant', 'context', architectureId, conversationId, selection, versions] as const,
}

/** A text file attached to a message: stored with the conversation, which goes on from it. */
export interface AssistantFile {
  name: string
  content: string
}

/** The longest file a conversation takes (the API's `FILE_DIGEST_MAX_LENGTH`). */
export const FILE_DIGEST_MAX_LENGTH = 600_000
/** A PDF holds far more bytes than text: past this it is not even opened. */
const PDF_MAX_BYTES = 50_000_000

export type FileProblem = 'several' | 'tooLong' | 'notText' | 'pdfUnreadable'

const isPdf = (file: File) =>
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

/**
 * The text of a PDF, read here in the browser (the API only ever gets text); `null` when it
 * cannot be opened. The reader is loaded only when a PDF is attached.
 */
async function pdfText(file: File): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  } catch {
    return null
  }
}

/**
 * Reads the files attached to a message into the one file the assistant takes: none, the text of
 * one text file or PDF, or why they cannot be sent.
 */
export async function readAttachment(
  files: readonly File[],
): Promise<{ file: AssistantFile | null } | { problem: FileProblem }> {
  if (files.length === 0) return { file: null }
  const [first] = files
  if (files.length > 1) return { problem: 'several' }
  let content: string
  if (isPdf(first)) {
    if (first.size > PDF_MAX_BYTES) return { problem: 'tooLong' }
    const text = await pdfText(first)
    // A scanned PDF opens but holds pictures of pages, no text.
    if (text === null || text.trim() === '') return { problem: 'pdfUnreadable' }
    content = text
  } else {
    // Read only when it can fit: a character is at least one byte.
    if (first.size > FILE_DIGEST_MAX_LENGTH * 4) return { problem: 'tooLong' }
    content = await first.text()
    if (content.includes('\u0000') || content.trim() === '') return { problem: 'notText' }
  }
  if (content.length > FILE_DIGEST_MAX_LENGTH) return { problem: 'tooLong' }
  return { file: { name: first.name, content } }
}

/** The last file attached, so a message sent again with it does not attach it again. */
let lastAttached: { conversationId: number; file: AssistantFile; fileId: number } | null = null

/**
 * Attaches a file to the conversation (`POST …/files`): the user's model summarizes it in a call
 * of its own, told by `onReading`, then the conversation keeps it and the next messages go on
 * from it without attaching it again. Answers the id the message names it by.
 */
async function attachFile(
  provider: StoredProvider,
  conversationId: number,
  file: AssistantFile | null | undefined,
  onReading?: (reading: boolean) => void,
): Promise<number | null> {
  if (!file) return null
  if (
    lastAttached?.conversationId === conversationId &&
    lastAttached.file.name === file.name &&
    lastAttached.file.content === file.content
  )
    return lastAttached.fileId
  onReading?.(true)
  try {
    const { file: attached } = await api.files.store({
      params: { conversationId },
      body: { ...callBody(provider), file },
      ...MODEL_CALL,
    })
    lastAttached = { conversationId, file, fileId: attached.id }
    return attached.id
  } finally {
    onReading?.(false)
  }
}

/** The views a message reads: the current one first, then `diagramIds` (all of them when absent). */
export interface ViewSelection {
  currentDiagramId: number | null
  diagramIds?: number[]
}

/** The account's conversations, newest first, a page at a time: `fetchNextPage` reads the next. */
export function useConversations() {
  return useInfiniteQuery({
    queryKey: assistantKeys.list,
    queryFn: ({ pageParam }) =>
      api.conversations.index({ query: { page: pageParam, perPage: CONVERSATIONS_PER_PAGE } }),
    initialPageParam: 1,
    getNextPageParam: ({ meta }) => (meta.page < meta.lastPage ? meta.page + 1 : undefined),
  })
}

/** A conversation with its messages. */
export function useConversation(conversationId: number | null) {
  return useQuery({
    queryKey: assistantKeys.conversation(conversationId ?? 0),
    queryFn: () => api.conversations.show({ params: { conversationId: conversationId ?? 0 } }),
    enabled: conversationId !== null,
  })
}

function useInvalidateAssistant() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: assistantKeys.all })
}

/** Creates an empty conversation of the account: `{ conversation }`. */
export function useCreateConversation() {
  const invalidate = useInvalidateAssistant()
  return useMutation({
    mutationFn: (title?: string) => api.conversations.store({ body: title ? { title } : {} }),
    onSuccess: invalidate,
  })
}

export function useRenameConversation() {
  const invalidate = useInvalidateAssistant()
  return useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: number; title: string }) =>
      api.conversations.update({ params: { conversationId }, body: { title } }),
    onSuccess: invalidate,
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: number) =>
      api.conversations.destroy({ params: { conversationId } }),
    // Only the list: reading the deleted conversation again would answer 404.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assistantKeys.list }),
  })
}

/**
 * Sends a message: `{ messages: [user, assistant] }`, or 422
 * `{ error: { code: 'context_full' } }` when the conversation must be continued from a summary.
 * About an architecture (`architectureId`), it goes with the views of the selection, or asks for a
 * diagram of a code map; about nothing (`null`), it is a plain message.
 *
 * The server may answer a plain message with a handoff instead of an exchange (it stored nothing):
 * `onHandoff` hears of it first, then one about an architecture's diagrams is sent again here, as a
 * message about that architecture with the views `viewsOf` gives, in the same pending call. One
 * for a web research comes back as `handoff` with no message: the caller runs the research.
 */
/** How many times a reply that ran out of steps goes on by itself (about 48 steps in all). */
const CONTINUATIONS_MAX = 3

/**
 * The conversation's chat, streamed through `useChat`: the reply being written (`draft`), its
 * `status` and `stop` (which cancels the call: the API then stores nothing). Hand `chat` to
 * `useAskAssistant`, which sends the plain messages through it.
 */
export function useAssistantChat(conversationId: number) {
  const chat = React.useMemo(
    () =>
      createAssistantChat<ChatOutput>(
        `${apiBaseUrl}/assistant/conversations/${String(conversationId)}/messages`,
      ),
    [conversationId],
  )
  const { messages, status } = useChat<AssistantChatMessage<ChatOutput>>({ chat })
  return { chat, draft: draftOf(messages), status, stop: () => stopChat(chat) }
}

export function useAskAssistant(conversationId: number, chat: AssistantChat) {
  const { locale } = useLocale()
  const t = useT().assistant
  const invalidate = useInvalidateAssistant()
  const readsFirst = useFeature('assistant-actions')
  return useMutation({
    mutationFn: async ({
      provider,
      message,
      architectureId,
      auto,
      page,
      context,
      pointed,
      file: attached,
      onReading,
      onHandoff,
      viewsOf,
      ...selection
    }: Partial<ViewSelection> & {
      provider: StoredProvider
      message: string
      architectureId: number | null
      /** A ready code map of the architecture's project: the message asks for a diagram of it. */
      codeMapId?: number
      /** With a plain message: the assistant decides what it needs, and may hand it over. */
      auto?: boolean
      /** With `auto`: where the owner is, so that "here" means something. */
      page?: AssistantPage
      /** With `auto`: the items the owner put in the context, which the assistant reads. */
      context?: ReturnType<typeof sentContext>['context']
      /** The parts of views the message is about, whatever route it takes. */
      pointed?: PointedPart[]
      /**
       * A file attached with this message; it follows a handed-over message. It is attached to
       * the conversation first, and `onReading` hears when that reading starts and ends.
       */
      file?: AssistantFile | null
      onReading?: (reading: boolean) => void
      onHandoff?: (handoff: AssistantHandoff) => void
      viewsOf?: (architectureId: number) => ViewSelection
    }): Promise<{
      messages: AssistantMessage[]
      handoff: AssistantHandoff | null
      /** The owner pressed Stop: what the last call was writing is dropped, nothing stored. */
      stopped?: boolean
    }> => {
      const fileId = await attachFile(provider, conversationId, attached, onReading)
      // What the request needs from the code, the maps or the files is read first, in a request
      // of its own (a few rounds at most), and stored in the conversation for the drawing to use.
      const readFirst = async (id: number) => {
        const read = (text: string) =>
          about.readings.store({
            params: { id, conversationId },
            body: {
              ...callBody(provider),
              message: text,
              locale,
              ...(pointed?.length ? { pointed } : {}),
              ...(fileId === null || text !== message ? {} : { fileId }),
            },
            ...MODEL_CALL,
          })
        let last = await read(message)
        const messages = [...last.messages]
        for (let round = 0; last.unfinished && round < CONTINUATIONS_MAX; round += 1) {
          last = await read(t.continueReading)
          messages.push(...last.messages)
        }
        return messages
      }
      const aboutArchitecture = async (
        id: number,
        views: Partial<ViewSelection> & { codeMapId?: number },
      ) => {
        const reading =
          readsFirst && provider.kind !== 'openai-codex' && views.codeMapId === undefined
            ? await readFirst(id)
            : []
        const { messages } = await about.messages.store({
          params: { id, conversationId },
          body: {
            ...callBody(provider),
            message,
            currentDiagramId: null,
            ...views,
            locale,
            ...(pointed?.length ? { pointed } : {}),
            ...(fileId === null ? {} : { fileId }),
            ...(reading.length > 0 ? { afterReading: true } : {}),
          },
          ...MODEL_CALL,
        })
        return [...reading, ...messages]
      }
      if (architectureId !== null)
        return { messages: await aboutArchitecture(architectureId, selection), handoff: null }
      // Streamed: the reply shows as it is written (`useAssistantChat`).
      const send = (text: string, withFile: boolean) =>
        sendChat(chat, text, {
          ...callBody(provider),
          locale,
          ...(fileId === null || !withFile ? {} : { fileId }),
          ...(auto ? { auto: true, ...(page ? { page } : {}), context: context ?? [] } : {}),
          ...(auto && pointed?.length ? { pointed } : {}),
        })
      const plain = await send(message, true)
      if (plain === null) return { messages: [], handoff: null, stopped: true }
      if (plain.handoff === null) {
        // A reply that ran out of steps (reading a repository, say) goes on, a few times at most.
        const messages = [...plain.messages]
        let last: ChatOutput = plain
        for (let round = 0; last.unfinished && round < CONTINUATIONS_MAX; round += 1) {
          const next = await send(t.continueReading, false)
          // Stopped: what was stored so far stands.
          if (next === null) break
          last = next
          // A continuation handed over stored nothing and is not unfinished: the loop ends.
          messages.push(...last.messages)
        }
        return { messages, handoff: null }
      }
      onHandoff?.(plain.handoff)
      if (plain.handoff.kind === 'web') return plain
      const { architectureId: handedTo } = plain.handoff
      return {
        messages: await aboutArchitecture(handedTo, viewsOf?.(handedTo) ?? {}),
        handoff: plain.handoff,
      }
    },
    onSuccess: invalidate,
  })
}

/**
 * What the next message about an architecture would cost with these views, in estimated tokens; no
 * model call. Read again when a view is saved (`versions`: the views' versions, in any stable
 * order). Asked only with an architecture.
 */
export function useContextBudget(
  architectureId: number | null,
  conversationId: number,
  selection: ViewSelection,
  versions: number[],
) {
  const { locale } = useLocale()
  return useQuery({
    queryKey: assistantKeys.context(architectureId ?? 0, conversationId, selection, versions),
    // Nothing of an earlier subject is shown once the message is about no architecture.
    placeholderData: architectureId === null ? undefined : keepPreviousData,
    queryFn: async () =>
      (
        await about.context({
          params: { id: architectureId ?? 0, conversationId },
          body: { ...selection, locale },
        })
      ).budget,
    enabled: architectureId !== null,
  })
}

/** Starts a new conversation from a summary of this one: `{ conversation, messages }`. */
export function useContinueConversation() {
  const { locale } = useLocale()
  const invalidate = useInvalidateAssistant()
  return useMutation({
    mutationFn: ({
      conversationId,
      provider,
    }: {
      conversationId: number
      provider: StoredProvider
    }) =>
      api.conversations.continue({
        params: { conversationId },
        body: { ...callBody(provider), locale },
        ...MODEL_CALL,
      }),
    onSuccess: invalidate,
  })
}

/** Deletes a summary message, to send the full history again. */
export function useDeleteSummary(conversationId: number) {
  const invalidate = useInvalidateAssistant()
  return useMutation({
    mutationFn: (messageId: number) =>
      api.messages.destroy({ params: { conversationId, messageId } }),
    onSuccess: invalidate,
  })
}

/**
 * Shows the exchange the server stored by itself (a web research's request and its proposals,
 * answered by `POST /agent-configs/:id/imports`) without waiting for the conversation to be read
 * again, which it is right after.
 */
export function useShowExchange(conversationId: number) {
  const queryClient = useQueryClient()
  return (messages: AssistantMessage[]) => {
    queryClient.setQueryData<ConversationDetail>(
      assistantKeys.conversation(conversationId),
      (detail) => {
        if (!detail) return detail
        // A refetch may already hold them: a message is shown once.
        const held = new Set(detail.messages.map((message) => message.id))
        const fresh = messages.filter((message) => !held.has(message.id))
        return { ...detail, messages: [...detail.messages, ...fresh] }
      },
    )
    return queryClient.invalidateQueries({ queryKey: assistantKeys.all })
  }
}

/**
 * Marks a message's proposals as handled, with the number of rules the owner added: 409
 * `already_settled` when they were. The conversation is read again either way.
 */
export function useSettleProposals(conversationId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ messageId, added }: { messageId: number; added: number }) =>
      api.proposals.settle({ params: { conversationId, messageId }, body: { added } }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: assistantKeys.conversation(conversationId) }),
  })
}

/**
 * Accepts, rejects or undoes a proposed change, through the architecture its message is about:
 * `{ change, diagram }`, or 409 (stale) / 422. The conversation and the architecture are read
 * again either way, before the promise settles. On the architecture's own page, wrap the call in
 * `applyChange` so the editor's unsaved text is saved first.
 */
export function useChangeAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      architectureId,
      conversationId,
      messageId,
      index,
      action,
    }: {
      architectureId: number
      conversationId: number
      messageId: number
      index: number
      action: ChangeAction
    }) =>
      about.changes[action]({ params: { id: architectureId, conversationId, messageId, index } }),
    onSettled: (_data, _error, { architectureId, conversationId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: assistantKeys.conversation(conversationId) }),
        queryClient.invalidateQueries({ queryKey: architectureKeys.detail(architectureId) }),
        // A view drawn from a code map's process brings links to the code with it.
        queryClient.invalidateQueries({ queryKey: ['code-maps'] }),
      ]),
  })
}

/** The action a refused answer (409, 422) carries: it tells its state as an accepted one does. */
function answeredAction(error: unknown): AssistantAction | undefined {
  if (!(error instanceof TuyauError)) return undefined
  return (error.response as { action?: AssistantAction } | undefined)?.action
}

/** What an accepted action changed: its domain, and the projects' count of architectures. */
const ACTION_KEYS = {
  // A deleted project takes its architectures and agent conventions with it.
  project: [projectKeys.all, architectureKeys.all, agentConfigKeys.all],
  architecture: [architectureKeys.all, projectKeys.all],
  // Projects count their agent conventions.
  'agent-config': [agentConfigKeys.all, projectKeys.all],
  // Every code map read (lists, links, conformance; `codeMapKeys.all`, written out since
  // `code-maps` imports this module), the reviews, the repository a project follows, and the
  // projects' count of maps.
  code: [['code-maps'], codeReviewKeys.all, githubKeys.follows, projectKeys.all],
} as const

/**
 * Accepts or rejects an action a message proposed on the account's work: `{ action }`, or 409 /
 * 422 with the action as it now stands (already answered, target gone, refused as invalid). The
 * conversation shows the returned action either way, and what an accepted one changed is read
 * again.
 */
export function useActionAnswer(conversationId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      messageId,
      index,
      answer,
    }: {
      messageId: number
      index: number
      answer: 'accept' | 'reject'
    }) => api.actions[answer]({ params: { conversationId, messageId, index } }),
    onSettled: (data, error, { messageId }) => {
      const action = data?.action ?? answeredAction(error)
      // Nothing came back (the action is unknown, the call failed): the server's copy decides.
      if (!action)
        return queryClient.invalidateQueries({
          queryKey: assistantKeys.conversation(conversationId),
        })
      queryClient.setQueryData<ConversationDetail>(
        assistantKeys.conversation(conversationId),
        (detail) =>
          detail && {
            ...detail,
            messages: detail.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    actions:
                      message.actions?.map((a) => (a.index === action.index ? action : a)) ?? null,
                  }
                : message,
            ),
          },
      )
      const domain = action.status === 'accepted' ? actionDomain(action.name) : null
      if (domain === null) return undefined
      return Promise.all(
        ACTION_KEYS[domain].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
    },
  })
}

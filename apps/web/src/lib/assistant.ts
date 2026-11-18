// Query and mutation hooks for the assistant: the account's conversations, and the messages and
// view changes that are about one architecture (the pattern of src/lib/query.ts). Model calls (a message, continuing a conversation) send the user's provider in
// the body, like src/lib/llm-provider.ts, and wait as long as the API bounds them.
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { architectureKeys } from '@/lib/architectures'
import type { ChangeAction } from '@/lib/assistant-changes'
import { client } from '@/lib/client'
import { MODEL_CALL, type StoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'
import { useLocale } from '@/lib/locale'

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
 */
export function useAskAssistant(conversationId: number) {
  const { locale } = useLocale()
  const invalidate = useInvalidateAssistant()
  return useMutation({
    mutationFn: ({
      provider,
      message,
      architectureId,
      ...selection
    }: Partial<ViewSelection> & {
      provider: StoredProvider
      message: string
      architectureId: number | null
      /** A ready code map of the architecture's project: the message asks for a diagram of it. */
      codeMapId?: number
    }): Promise<{ messages: AssistantMessage[] }> =>
      architectureId === null
        ? api.messages.store({
            params: { conversationId },
            body: { ...callBody(provider), message, locale },
            ...MODEL_CALL,
          })
        : about.messages.store({
            params: { id: architectureId, conversationId },
            body: {
              ...callBody(provider),
              message,
              currentDiagramId: null,
              ...selection,
              locale,
            },
            ...MODEL_CALL,
          }),
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
      (detail) => detail && { ...detail, messages: [...detail.messages, ...messages] },
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

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

import { agentConfigKeys } from '@/lib/agent-configs'
import { architectureKeys } from '@/lib/architectures'
import { actionDomain } from '@/lib/assistant-actions'
import type { ChangeAction } from '@/lib/assistant-changes'
import type { AssistantPage } from '@/lib/assistant-subject'
import { client, TuyauError } from '@/lib/client'
import { codeReviewKeys } from '@/lib/code-reviews'
import { githubKeys } from '@/lib/github'
import { MODEL_CALL, type StoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'
import { useLocale } from '@/lib/locale'
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
/** Where the server sends a plain message instead of answering it. */
export type AssistantHandoff = NonNullable<
  Awaited<ReturnType<typeof api.messages.store>>['handoff']
>

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
 *
 * The server may answer a plain message with a handoff instead of an exchange (it stored nothing):
 * `onHandoff` hears of it first, then one about an architecture's diagrams is sent again here, as a
 * message about that architecture with the views `viewsOf` gives, in the same pending call. One
 * for a web research comes back as `handoff` with no message: the caller runs the research.
 */
export function useAskAssistant(conversationId: number) {
  const { locale } = useLocale()
  const invalidate = useInvalidateAssistant()
  return useMutation({
    mutationFn: async ({
      provider,
      message,
      architectureId,
      auto,
      page,
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
      onHandoff?: (handoff: AssistantHandoff) => void
      viewsOf?: (architectureId: number) => ViewSelection
    }): Promise<{ messages: AssistantMessage[]; handoff: AssistantHandoff | null }> => {
      const aboutArchitecture = async (id: number, views: Partial<ViewSelection>) => {
        const { messages } = await about.messages.store({
          params: { id, conversationId },
          body: { ...callBody(provider), message, currentDiagramId: null, ...views, locale },
          ...MODEL_CALL,
        })
        return messages
      }
      if (architectureId !== null)
        return { messages: await aboutArchitecture(architectureId, selection), handoff: null }
      const plain = await api.messages.store({
        params: { conversationId },
        body: {
          ...callBody(provider),
          message,
          locale,
          ...(auto ? { auto: true, ...(page ? { page } : {}) } : {}),
        },
        ...MODEL_CALL,
      })
      if (plain.handoff === null) return plain
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

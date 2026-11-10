// Query and mutation hooks for the workspace assistant of one architecture (the pattern of
// src/lib/query.ts). Model calls (a message, continuing a conversation) send the user's provider in
// the body, like src/lib/llm-provider.ts, and wait as long as the API bounds them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { architectureKeys } from '@/lib/architectures'
import type { ChangeAction } from '@/lib/assistant-changes'
import { client } from '@/lib/client'
import { MODEL_CALL, type StoredProvider } from '@/lib/llm-provider'
import { callBody } from '@/lib/llm-provider-body'
import { useLocale } from '@/lib/locale'

export type { AutosaveControl, BudgetLevel, ChangeAction } from '@/lib/assistant-changes'
export { applyChange, budgetLevel } from '@/lib/assistant-changes'

const api = client.api.architectures.assistant

export type ConversationSummary = Awaited<
  ReturnType<typeof api.conversations.index>
>['data'][number]
export type ConversationDetail = Awaited<ReturnType<typeof api.conversations.show>>
export type AssistantMessage = ConversationDetail['messages'][number]
export type ProposedChange = NonNullable<AssistantMessage['changes']>[number]

export const assistantKeys = {
  all: (architectureId: number) => ['assistant', architectureId] as const,
  list: (architectureId: number, page: number) =>
    ['assistant', architectureId, 'list', page] as const,
  conversation: (architectureId: number, conversationId: number) =>
    ['assistant', architectureId, 'conversation', conversationId] as const,
  context: (architectureId: number, conversationId: number, selection: ViewSelection) =>
    ['assistant', architectureId, 'context', conversationId, selection] as const,
}

/** The views a message reads: the current one first, then `diagramIds` (all of them when absent). */
export interface ViewSelection {
  currentDiagramId: number | null
  diagramIds?: number[]
}

export function useConversations(architectureId: number, page = 1) {
  return useQuery({
    queryKey: assistantKeys.list(architectureId, page),
    queryFn: () =>
      api.conversations.index({ params: { id: architectureId }, query: { page, perPage: 50 } }),
  })
}

/** A conversation with its messages and the budget of its next message. */
export function useConversation(architectureId: number, conversationId: number | null) {
  return useQuery({
    queryKey: assistantKeys.conversation(architectureId, conversationId ?? 0),
    queryFn: () =>
      api.conversations.show({
        params: { id: architectureId, conversationId: conversationId ?? 0 },
      }),
    enabled: conversationId !== null,
  })
}

function useInvalidateAssistant(architectureId: number) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: assistantKeys.all(architectureId) })
}

export function useCreateConversation(architectureId: number) {
  const invalidate = useInvalidateAssistant(architectureId)
  return useMutation({
    mutationFn: (title?: string) =>
      api.conversations.store({ params: { id: architectureId }, body: title ? { title } : {} }),
    onSuccess: invalidate,
  })
}

export function useRenameConversation(architectureId: number) {
  const invalidate = useInvalidateAssistant(architectureId)
  return useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: number; title: string }) =>
      api.conversations.update({ params: { id: architectureId, conversationId }, body: { title } }),
    onSuccess: invalidate,
  })
}

export function useDeleteConversation(architectureId: number) {
  const invalidate = useInvalidateAssistant(architectureId)
  return useMutation({
    mutationFn: (conversationId: number) =>
      api.conversations.destroy({ params: { id: architectureId, conversationId } }),
    onSuccess: invalidate,
  })
}

/**
 * Sends a message: `{ messages: [user, assistant], budget, skipped }`, or 422
 * `{ error: { code: 'context_full' } }` when the conversation must be continued from a summary.
 */
export function useAskAssistant(architectureId: number, conversationId: number) {
  const { locale } = useLocale()
  const invalidate = useInvalidateAssistant(architectureId)
  return useMutation({
    mutationFn: ({
      provider,
      message,
      ...selection
    }: ViewSelection & { provider: StoredProvider; message: string }) =>
      api.messages.store({
        params: { id: architectureId, conversationId },
        body: { ...callBody(provider), message, ...selection, locale },
        ...MODEL_CALL,
      }),
    onSuccess: invalidate,
  })
}

/** What the next message would cost with these views, in estimated tokens; no model call. */
export function useContextBudget(
  architectureId: number,
  conversationId: number | null,
  selection: ViewSelection,
) {
  const { locale } = useLocale()
  return useQuery({
    queryKey: assistantKeys.context(architectureId, conversationId ?? 0, selection),
    queryFn: async () =>
      (
        await api.context({
          params: { id: architectureId, conversationId: conversationId ?? 0 },
          body: { ...selection, locale },
        })
      ).budget,
    enabled: conversationId !== null,
  })
}

/** Starts a new conversation from a summary of this one: `{ conversation, messages, budget }`. */
export function useContinueConversation(architectureId: number) {
  const { locale } = useLocale()
  const invalidate = useInvalidateAssistant(architectureId)
  return useMutation({
    mutationFn: ({
      conversationId,
      provider,
    }: {
      conversationId: number
      provider: StoredProvider
    }) =>
      api.conversations.continue({
        params: { id: architectureId, conversationId },
        body: { ...callBody(provider), locale },
        ...MODEL_CALL,
      }),
    onSuccess: invalidate,
  })
}

/** Deletes a summary message, to send the full history again. */
export function useDeleteSummary(architectureId: number, conversationId: number) {
  const invalidate = useInvalidateAssistant(architectureId)
  return useMutation({
    mutationFn: (messageId: number) =>
      api.messages.destroy({ params: { id: architectureId, conversationId, messageId } }),
    onSuccess: invalidate,
  })
}

/**
 * Accepts, rejects or undoes a proposed change: `{ change, diagram }`, or 409 (stale) / 422. The
 * conversation and the architecture are read again either way, before the promise settles. Wrap
 * the call in `applyChange` so the editor's unsaved text is saved first.
 */
export function useChangeAction(architectureId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      conversationId,
      messageId,
      index,
      action,
    }: {
      conversationId: number
      messageId: number
      index: number
      action: ChangeAction
    }) => api.changes[action]({ params: { id: architectureId, conversationId, messageId, index } }),
    onSettled: (_data, _error, { conversationId }) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: assistantKeys.conversation(architectureId, conversationId),
        }),
        queryClient.invalidateQueries({ queryKey: architectureKeys.detail(architectureId) }),
      ]),
  })
}

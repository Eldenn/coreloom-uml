// The assistant, the same on every page (inside the floating chat of `assistant-widget.tsx`): the
// account's conversations, the context gauge, the messages with the view changes, the actions or
// the rules proposed, the context of the next message and the prompt. Over an architecture's page
// it knows the open view. Model calls use the provider stored in this browser; without one the
// panel points to the settings.
import { useRouterState } from '@tanstack/react-router'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { ContextChips } from '@/assistant/assistant-context-chips'
import { Conversation, NoProvider } from '@/assistant/assistant-conversation'
import { useSubject } from '@/assistant/use-subject'
import { Button } from '@/components/ui/button'
import { EditableText } from '@/components/ui/editable-text'
import { Popconfirm } from '@/components/ui/popconfirm'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import {
  type ConversationSummary,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
} from '@/lib/assistant'
import { useAssistant } from '@/lib/assistant-context'
import { getErrorMessage } from '@/lib/client'
import { useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

/** As the API's `ASSISTANT_TITLE_MAX_LENGTH`. */
const CONVERSATION_TITLE_MAX_LENGTH = 200

type PageRoute = '/_authed/agent-configs/$id' | '/_authed/projects/$projectId'

/** The id in the address of the page shown, when it is a page of that kind. */
function usePageId(routeId: PageRoute, name: 'id' | 'projectId'): number | null {
  return useRouterState({
    select: (state) => {
      const params = state.matches.find((match) => match.routeId === routeId)?.params as
        Record<string, unknown> | undefined
      const value = params?.[name]
      return typeof value === 'number' ? value : null
    },
  })
}

export function AssistantPanel() {
  const t = useT().assistant
  const provider = useStoredProvider()
  const list = useConversations()
  const { conversationId: chosen, showConversation: setChosen, workspace, items } = useAssistant()
  const conversations = list.data?.pages.flatMap((page) => page.data) ?? []
  const current = conversations.find((c) => c.id === chosen) ?? conversations.at(0)
  const create = useCreateConversation()
  // Held here, not in a conversation: "Draw from the code" switched off holds when another
  // conversation opens.
  const subject = useSubject({
    architecture: workspace?.architecture,
    provider,
    codeMapId: workspace?.codeMapId,
    pageConfigId: usePageId('/_authed/agent-configs/$id', 'id'),
    pageProjectId: usePageId('/_authed/projects/$projectId', 'projectId'),
    items,
  })
  const startConversation = () => {
    create.mutate(undefined, {
      onSuccess: ({ conversation }) => {
        setChosen(conversation.id)
      },
      onError: (error) => toast.error(getErrorMessage(error, t.actionFailed)),
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConversationHeader
        list={list}
        conversations={conversations}
        current={current}
        onChoose={setChosen}
        onStart={startConversation}
        starting={create.isPending}
      />
      {current ? (
        <Conversation
          // Going to another architecture's page starts it over: the views picked are that page's.
          key={`${String(current.id)}:${String(workspace?.architecture.id)}`}
          workspace={workspace}
          conversationId={current.id}
          provider={provider}
          onContinued={setChosen}
          subject={subject}
        />
      ) : (
        <div className="flex flex-1 flex-col items-start gap-3 p-4">
          {provider === null && <NoProvider />}
          {!list.isPending && (
            <>
              <p className="m-0 text-[13px] text-muted-foreground">{t.noConversation}</p>
              {/* What the owner already put in the context waits for the conversation. */}
              {items.length > 0 && <ContextChips disabled={false} />}
              <Button
                size="sm"
                variant="outline"
                disabled={create.isPending}
                onClick={startConversation}
              >
                <PlusIcon /> {t.newConversation}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Which conversation is open, a new one, its title, deleting it; more pages when there are. */
function ConversationHeader({
  list,
  conversations,
  current,
  onChoose,
  onStart,
  starting,
}: {
  list: ReturnType<typeof useConversations>
  conversations: ConversationSummary[]
  current: ConversationSummary | undefined
  onChoose: (conversationId: number | null) => void
  onStart: () => void
  starting: boolean
}) {
  const t = useT().assistant
  const rename = useRenameConversation()
  const remove = useDeleteConversation()
  const failed = (error: unknown) => toast.error(getErrorMessage(error, t.actionFailed))
  const total = list.data?.pages.at(-1)?.meta.total ?? 0
  const conversationId = current?.id ?? null
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <div className="flex items-center gap-2">
        {conversations.length > 0 && (
          <Select
            value={conversationId === null ? '' : String(conversationId)}
            onValueChange={(value) => {
              onChoose(Number(value))
            }}
          >
            <SelectTrigger size="sm" aria-label={t.conversation} className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conversations.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.title || t.untitled}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={t.newConversation}
          title={t.newConversation}
          disabled={starting}
          onClick={onStart}
        >
          <PlusIcon />
        </Button>
        {current && (
          <Popconfirm
            title={t.deleteConversationConfirm}
            confirmLabel={t.delete}
            destructive
            onConfirm={() =>
              remove
                .mutateAsync(current.id, {
                  onSuccess: () => {
                    onChoose(null)
                  },
                  onError: failed,
                })
                // Told by the toast above; the popover only waits for the call.
                .catch(() => undefined)
            }
          >
            <Button size="icon-sm" variant="ghost" aria-label={t.deleteConversation}>
              <Trash2Icon />
            </Button>
          </Popconfirm>
        )}
      </div>
      {list.hasNextPage && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {t.shownOf(conversations.length, total)}
          <Button
            size="sm"
            variant="link"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t.loadMore}
          </Button>
        </p>
      )}
      {current && (
        <EditableText
          key={current.id}
          value={current.title}
          label={t.conversationTitle}
          placeholder={t.untitled}
          required
          maxLength={CONVERSATION_TITLE_MAX_LENGTH}
          className="text-[13px] font-semibold text-foreground"
          onValueChange={(title) => {
            rename.mutate({ conversationId: current.id, title }, { onError: failed })
          }}
        />
      )}
    </div>
  )
}

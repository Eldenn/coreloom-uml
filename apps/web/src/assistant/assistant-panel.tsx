// The workspace assistant of one architecture: its conversations, the views a message reads, the
// context gauge, the messages with their proposed view changes, and the prompt. Model calls use the
// provider stored in this browser; without one the panel points to the settings.
import { Link } from '@tanstack/react-router'
import { PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import * as React from 'react'

import { MessageList } from '@/assistant/assistant-messages'
import { useChangeActions } from '@/assistant/use-change-actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ContextMeter } from '@/components/ui/context-meter'
import { EditableText } from '@/components/ui/editable-text'
import { MultiSelect } from '@/components/ui/multi-select'
import { Popconfirm } from '@/components/ui/popconfirm'
import { PromptInput } from '@/components/ui/prompt-input'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/sonner'
import type { ArchitectureDetail } from '@/lib/architectures'
import {
  type AutosaveControl,
  budgetLevel,
  type ConversationSummary,
  useAskAssistant,
  useContextBudget,
  useContinueConversation,
  useConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useDeleteSummary,
  useRenameConversation,
  type ViewSelection,
} from '@/lib/assistant'
import type { ContextBudget } from '@/lib/assistant-changes'
import { getErrorMessage, TuyauError } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { providerCallFailure, type StoredProvider, useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

/** A 422 `{ error: { code: 'context_full' } }`: the message would not fit the model's input. */
function isContextFull(error: unknown) {
  return (
    error instanceof TuyauError &&
    error.status === 422 &&
    (error.response as { error?: { code?: string } } | undefined)?.error?.code === 'context_full'
  )
}

/** As the API's `ASSISTANT_TITLE_MAX_LENGTH`. */
const CONVERSATION_TITLE_MAX_LENGTH = 200

/** Where the workspace lays out side by side (Tailwind's `lg`, as in DiagramWorkspace). */
const WIDE_SCREEN = '(min-width: 1024px)'

function subscribeWide(onChange: () => void) {
  const query = window.matchMedia(WIDE_SCREEN)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

function useWideScreen() {
  return React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_SCREEN).matches,
    () => false,
  )
}

type PanelProps = React.ComponentProps<typeof AssistantPanel>

/**
 * The workspace (`children`) with the assistant: a resizable side panel on wide screens, a sheet
 * on narrow ones. The workspace stays mounted when the panel opens or closes.
 */
export function AssistantLayout({
  open: requested,
  onOpenChange,
  height,
  children,
  ...panel
}: PanelProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** CSS height of the side panel: the workspace's. */
  height: string
  children: React.ReactNode
}) {
  const t = useT().assistant
  const wide = useWideScreen()
  // The toggle is hidden while the flag is off; this keeps the panel shut as well.
  const enabled = useFeature('diagram-assistant')
  const open = requested && enabled
  if (!wide)
    return (
      <>
        {children}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent className="w-full gap-0 sm:max-w-lg">
            <SheetHeader className="border-b border-border">
              <SheetTitle>{t.title}</SheetTitle>
              <SheetDescription className="sr-only">{t.empty}</SheetDescription>
            </SheetHeader>
            <AssistantPanel {...panel} />
          </SheetContent>
        </Sheet>
      </>
    )
  return (
    <ResizablePanelGroup orientation="horizontal">
      <ResizablePanel id="workspace" minSize="40">
        {children}
      </ResizablePanel>
      {open && (
        <>
          <ResizableHandle withHandle className="mx-2" />
          <ResizablePanel id="assistant" defaultSize="32" minSize={320}>
            <section
              aria-label={t.title}
              className="flex flex-col rounded-md border border-border bg-card"
              style={{ height }}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <h2 className="m-0 text-[14px] font-semibold text-foreground">{t.title}</h2>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t.close}
                  onClick={() => {
                    onOpenChange(false)
                  }}
                >
                  <XIcon />
                </Button>
              </div>
              <AssistantPanel {...panel} />
            </section>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}

export function AssistantPanel({
  architecture,
  currentDiagramId,
  autosave,
}: {
  architecture: ArchitectureDetail
  currentDiagramId: number | null
  autosave: AutosaveControl
}) {
  const t = useT().assistant
  const provider = useStoredProvider()
  const architectureId = architecture.id
  const list = useConversations(architectureId)
  const [chosen, setChosen] = React.useState<number | null>(null)
  const conversations = list.data?.pages.flatMap((page) => page.data) ?? []
  const conversationId =
    conversations.find((c) => c.id === chosen)?.id ?? conversations.at(0)?.id ?? null
  const create = useCreateConversation(architectureId)
  const current = conversations.find((c) => c.id === conversationId)
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
        architectureId={architectureId}
        list={list}
        conversations={conversations}
        current={current}
        onChoose={setChosen}
        onStart={startConversation}
        starting={create.isPending}
      />
      {conversationId === null ? (
        <div className="flex flex-1 flex-col items-start gap-3 p-4">
          {provider === null && <NoProvider />}
          <p className="m-0 text-[13px] text-muted-foreground">
            {list.isPending ? null : t.noConversation}
          </p>
          {!list.isPending && (
            <Button
              size="sm"
              variant="outline"
              disabled={create.isPending}
              onClick={startConversation}
            >
              <PlusIcon /> {t.newConversation}
            </Button>
          )}
        </div>
      ) : (
        <Conversation
          key={conversationId}
          architecture={architecture}
          conversationId={conversationId}
          currentDiagramId={currentDiagramId}
          autosave={autosave}
          provider={provider}
          onContinued={setChosen}
        />
      )}
    </div>
  )
}

/** Which conversation is open, a new one, its title, deleting it; more pages when there are. */
function ConversationHeader({
  architectureId,
  list,
  conversations,
  current,
  onChoose,
  onStart,
  starting,
}: {
  architectureId: number
  list: ReturnType<typeof useConversations>
  conversations: ConversationSummary[]
  current: ConversationSummary | undefined
  onChoose: (conversationId: number | null) => void
  onStart: () => void
  starting: boolean
}) {
  const t = useT().assistant
  const rename = useRenameConversation(architectureId)
  const remove = useDeleteConversation(architectureId)
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

function NoProvider() {
  const t = useT().assistant
  return (
    <Alert>
      <AlertDescription className="flex flex-col items-start gap-2">
        {t.noProvider}
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings">{t.openSettings}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function Conversation({
  architecture,
  conversationId,
  currentDiagramId,
  autosave,
  provider,
  onContinued,
}: {
  architecture: ArchitectureDetail
  conversationId: number
  currentDiagramId: number | null
  autosave: AutosaveControl
  provider: StoredProvider | null
  onContinued: (conversationId: number) => void
}) {
  const t = useT().assistant
  const architectureId = architecture.id
  const detail = useConversation(architectureId, conversationId)
  /** The views the owner picked; `null` until one is unchecked, meaning all of them. */
  const [picked, setPicked] = React.useState<number[] | null>(null)
  const selection: ViewSelection = { currentDiagramId, ...(picked ? { diagramIds: picked } : {}) }
  const context = useContextBudget(architectureId, conversationId, selection)
  const ask = useAskAssistant(architectureId, conversationId)
  const proceed = useContinueConversation(architectureId)
  const deleteSummary = useDeleteSummary(architectureId, conversationId)
  const changes = useChangeActions(architectureId, conversationId, autosave)
  const [draft, setDraft] = React.useState('')

  const messages = detail.data?.messages ?? []
  const budget = context.data ?? detail.data?.budget
  const full = (budget !== undefined && budgetLevel(budget) === 'full') || isContextFull(ask.error)

  const send = (text: string) => {
    if (!provider) return
    ask.mutate(
      { provider, message: text, ...selection },
      {
        onError: () => {
          // The field cleared itself on submit: the text comes back so nothing is lost.
          setDraft((now) => (now === '' ? text : now))
        },
      },
    )
  }

  return (
    <>
      <ViewsAndBudget
        diagrams={architecture.diagrams}
        currentDiagramId={currentDiagramId}
        picked={picked}
        onPickedChange={setPicked}
        budget={budget}
      />
      <MessageList
        messages={messages}
        loaded={detail.isSuccess}
        asking={ask.isPending ? ask.variables.message : null}
        waiting={ask.isPending || proceed.isPending}
        changes={changes}
        onDeleteSummary={(messageId) => {
          deleteSummary.mutate(messageId, {
            onError: (error) => toast.error(getErrorMessage(error, t.actionFailed)),
          })
        }}
      />
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <Notices
          provider={provider}
          budget={budget}
          full={full}
          askError={ask.isError && !isContextFull(ask.error) ? ask.error : null}
          continueError={proceed.error}
          continuing={proceed.isPending}
          onContinue={() => {
            if (!provider) return
            proceed.mutate(
              { conversationId, provider },
              {
                onSuccess: ({ conversation }) => {
                  onContinued(conversation.id)
                },
              },
            )
          }}
        />
        <PromptInput
          value={draft}
          onValueChange={setDraft}
          placeholder={t.placeholder}
          status={ask.isPending ? 'submitted' : 'ready'}
          disabled={!provider || full || proceed.isPending}
          onSubmit={({ text }) => {
            send(text)
          }}
        />
      </div>
    </>
  )
}

/** The views a message reads (the open one always) and what the next message would cost. */
function ViewsAndBudget({
  diagrams,
  currentDiagramId,
  picked,
  onPickedChange,
  budget,
}: {
  diagrams: ArchitectureDetail['diagrams']
  currentDiagramId: number | null
  picked: number[] | null
  onPickedChange: (ids: number[]) => void
  budget: ContextBudget | undefined
}) {
  const t = useT().assistant
  const titleOf = (id: number) => diagrams.find((d) => d.id === id)?.title ?? String(id)
  const included = picked ?? diagrams.map((d) => d.id)
  const value = [
    ...new Set([...(currentDiagramId === null ? [] : [currentDiagramId]), ...included]),
  ]
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <MultiSelect
        aria-label={t.views}
        placeholder={t.views}
        searchPlaceholder={t.viewsSearch}
        options={diagrams.map((d) => ({
          value: String(d.id),
          label: d.title,
          disabled: d.id === currentDiagramId,
        }))}
        value={value.map(String)}
        onValueChange={(values) => {
          onPickedChange(values.map(Number))
        }}
      />
      <p className="m-0 text-[12px] text-muted-foreground">{t.viewsHint}</p>
      {budget && (
        <div className="flex flex-wrap items-center gap-2">
          <ContextMeter used={budget.system + budget.diagrams + budget.history} max={budget.max} />
          {budget.skipped.length > 0 && (
            <span className="text-[12px] text-warning">
              {t.skipped(budget.skipped.map(titleOf).join(', '))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Above the prompt: a missing provider, a failed call, a conversation getting too long. */
function Notices({
  provider,
  budget,
  full,
  askError,
  continueError,
  continuing,
  onContinue,
}: {
  provider: StoredProvider | null
  budget: ContextBudget | undefined
  full: boolean
  askError: unknown
  continueError: unknown
  continuing: boolean
  onContinue: () => void
}) {
  const t = useT().assistant
  const failureText = useProviderFailureText()
  const long = full || (budget !== undefined && budgetLevel(budget) === 'warn')
  return (
    <>
      {provider === null && <NoProvider />}
      {askError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{failureText(providerCallFailure(askError))}</AlertDescription>
        </Alert>
      )}
      {continueError !== null && (
        <Alert variant="destructive">
          <AlertDescription>{failureText(providerCallFailure(continueError))}</AlertDescription>
        </Alert>
      )}
      {long && (
        <Alert variant={full ? 'destructive' : 'warning'}>
          <AlertDescription className="flex flex-col items-start gap-2">
            {full ? t.full : t.long}
            <Button
              size="sm"
              variant="outline"
              disabled={!provider || continuing}
              onClick={onContinue}
            >
              {t.continue}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

// The assistant, the same on every page: the account's conversations, what a message is about (an
// architecture and the views it reads, agent conventions made from the web, or nothing), the
// context gauge, the messages with the view changes or the rules proposed, and the prompt. On an
// architecture's page it sits beside the workspace and knows the open view. Model calls use the
// provider stored in this browser; without one the panel points to the settings.
import { PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Conversation, NoProvider, type Workspace } from '@/assistant/assistant-conversation'
import { useSubject } from '@/assistant/use-subject'
import { Button } from '@/components/ui/button'
import { EditableText } from '@/components/ui/editable-text'
import { Popconfirm } from '@/components/ui/popconfirm'
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
  type ConversationSummary,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
} from '@/lib/assistant'
import { getErrorMessage } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

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
        <AssistantSheet open={open} onOpenChange={onOpenChange} {...panel} />
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

/** The assistant in a side sheet: on every page but an architecture's wide workspace. */
export function AssistantSheet({
  open,
  onOpenChange,
  ...panel
}: PanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT().assistant
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription className="sr-only">{t.empty}</SheetDescription>
        </SheetHeader>
        <AssistantPanel {...panel} />
      </SheetContent>
    </Sheet>
  )
}

type SubjectPage = Parameters<typeof useSubject>[0]

interface PanelProps extends Omit<SubjectPage, 'provider' | 'architecture'> {
  /** On an architecture's page: that architecture, its open view and its editor's autosave. */
  architecture?: ArchitectureDetail
  currentDiagramId?: number | null
  autosave?: AutosaveControl
  /** The conversation shown first, when it is among the account's newest; else the newest. */
  initialConversationId?: number | null
}

function workspaceOf({ architecture, currentDiagramId, autosave }: PanelProps): Workspace | null {
  if (!architecture || !autosave) return null
  return { architecture, currentDiagramId: currentDiagramId ?? null, autosave }
}

export function AssistantPanel(props: PanelProps) {
  const t = useT().assistant
  const provider = useStoredProvider()
  const list = useConversations()
  const [chosen, setChosen] = React.useState(props.initialConversationId ?? null)
  const conversations = list.data?.pages.flatMap((page) => page.data) ?? []
  const current = conversations.find((c) => c.id === chosen) ?? conversations.at(0)
  const create = useCreateConversation()
  // Held here, not in a conversation: what a message is about, and "Draw from the code" switched
  // off, hold when another conversation opens.
  const subject = useSubject({ ...props, provider })
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
          key={current.id}
          workspace={workspaceOf(props)}
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

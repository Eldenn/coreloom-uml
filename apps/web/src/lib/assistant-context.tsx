// The assistant's state, shared by every page of the shell: whether its floating chat is open,
// the conversation shown, the context the owner made (the items the next messages are about,
// added from an item's menu) and the architecture page it floats over, if any. The context stays
// from one conversation to the next, until the owner takes an item out; a reload empties it.
import { SparklesIcon } from 'lucide-react'
import * as React from 'react'

import { useAutoOffered } from '@/assistant/use-subject'
import { toast } from '@/components/ui/sonner'
import type { ArchitectureDetail } from '@/lib/architectures'
import type { AutosaveControl } from '@/lib/assistant'
import {
  addItem,
  architectureOfItem,
  type ContextItem,
  sameItem,
  workspaceItems,
  type WorkspaceTarget,
} from '@/lib/assistant-subject'
import { useFeature } from '@/lib/feature-flags'
import { useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

/** An architecture's page under the chat: its open view and its editor's autosave. */
export interface Workspace {
  architecture: ArchitectureDetail
  currentDiagramId: number | null
  autosave: AutosaveControl
  /** A code map the page was opened to draw from (`?code=`). */
  codeMapId?: number
}

/**
 * A conversation that is a design brief for a project: every message of it carries the marker,
 * and `first` is the brief itself until it is sent. Which conversation is a brief for which
 * project is a browser preference in `localStorage`, so the path survives a reload; the brief's
 * text is not kept there.
 */
interface DesignBrief {
  projectId: number
  first: string | null
}

const BRIEFS_KEY = 'assistant-briefs'
/** The newest conversations kept; an older one becomes a plain conversation again. */
const BRIEFS_KEPT = 50

function storedBriefs(): Map<number, DesignBrief> {
  try {
    const pairs = JSON.parse(window.localStorage.getItem(BRIEFS_KEY) ?? '[]') as [number, number][]
    return new Map(pairs.map(([id, projectId]) => [id, { projectId, first: null }]))
  } catch {
    return new Map()
  }
}

function storeBriefs(briefs: Map<number, DesignBrief>) {
  const pairs = [...briefs].slice(-BRIEFS_KEPT).map(([id, brief]) => [id, brief.projectId])
  try {
    window.localStorage.setItem(BRIEFS_KEY, JSON.stringify(pairs))
  } catch {
    // Storage refused (private mode, full): the brief then lasts as long as the tab.
  }
}

interface AssistantState {
  open: boolean
  conversationId: number | null
  items: readonly ContextItem[]
  workspace: Workspace | null
}

/** What never changes: a page that only calls these does not render again with the chat. */
interface AssistantControls {
  setOpen: (open: boolean) => void
  /** `null` shows the newest conversation. */
  showConversation: (conversationId: number | null) => void
  setWorkspace: (workspace: Workspace | null) => void
  setItems: (items: readonly ContextItem[]) => void
  /** The context as it is now, for a caller that must not render again with the chat. */
  readItems: () => readonly ContextItem[]
  /** Opens the chat on a new conversation that is a brief for the project; `brief` goes first. */
  startBrief: (conversationId: number, projectId: number, brief: string) => void
  /** The project this conversation is a design brief for, if it is one. */
  briefOf: (conversationId: number) => number | null
  /** The brief to send first, once: `null` when there is none or it was taken already. */
  takeBrief: (conversationId: number) => string | null
}

const StateContext = React.createContext<AssistantState | null>(null)
const ControlsContext = React.createContext<AssistantControls | null>(null)

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [conversationId, setConversationId] = React.useState<number | null>(null)
  const [items, setItems] = React.useState<readonly ContextItem[]>([])
  const [workspace, setWorkspace] = React.useState<Workspace | null>(null)
  // Read when a conversation opens, never rendered: a ref, not a state.
  const briefs = React.useRef<Map<number, DesignBrief> | null>(null)
  const readBriefs = () => (briefs.current ??= storedBriefs())
  // The setters of `useState`: stable, so the object is too.
  const held = React.useRef(items)
  React.useEffect(() => {
    held.current = items
  }, [items])
  const controls = React.useMemo<AssistantControls>(
    () => ({
      setOpen,
      showConversation: setConversationId,
      setWorkspace,
      setItems,
      readItems: () => held.current,
      startBrief: (conversationId, projectId, brief) => {
        readBriefs().set(conversationId, { projectId, first: brief })
        storeBriefs(readBriefs())
        setConversationId(conversationId)
        setOpen(true)
      },
      briefOf: (conversationId) => readBriefs().get(conversationId)?.projectId ?? null,
      takeBrief: (conversationId) => {
        const brief = readBriefs().get(conversationId)
        const first = brief?.first ?? null
        if (brief) brief.first = null
        return first
      },
    }),
    [],
  )
  const state = React.useMemo(
    () => ({ open, conversationId, items, workspace }),
    [open, conversationId, items, workspace],
  )
  return (
    <ControlsContext value={controls}>
      <StateContext value={state}>{children}</StateContext>
    </ControlsContext>
  )
}

function useControls(): AssistantControls {
  const controls = React.use(ControlsContext)
  if (!controls) throw new Error('useAssistant needs an AssistantProvider')
  return controls
}

export function useAssistant(): AssistantState & AssistantControls {
  const state = React.use(StateContext)
  const controls = useControls()
  if (!state) throw new Error('useAssistant needs an AssistantProvider')
  return { ...state, ...controls }
}

/**
 * On an architecture's page: tells the chat which architecture it floats over, its open view and
 * its editor's autosave, so a message is about it and an accepted change goes through the editor.
 * `conversationId` (`?assistant=`) opens the chat on that conversation.
 */
export function useAssistantWorkspace(workspace: Workspace, conversationId: number | undefined) {
  const { setWorkspace, setOpen, showConversation } = useControls()
  const { architecture, currentDiagramId, autosave, codeMapId } = workspace
  React.useEffect(() => {
    setWorkspace({ architecture, currentDiagramId, autosave, codeMapId })
  }, [setWorkspace, architecture, currentDiagramId, autosave, codeMapId])
  React.useEffect(
    () => () => {
      setWorkspace(null)
    },
    [setWorkspace],
  )
  React.useEffect(() => {
    if (conversationId === undefined) return
    showConversation(conversationId)
    setOpen(true)
  }, [conversationId, showConversation, setOpen])
}

/**
 * Whether an item can go in the assistant's context, whether it is there, and the switch. Not
 * offered while the assistant is off, nor, without "Auto", for anything but an architecture: the
 * diagram assistant reads nothing else.
 */
export function useContextItem(item: ContextItem) {
  const t = useT().assistant
  const { items, setItems, setOpen } = useAssistant()
  const enabled = useFeature('diagram-assistant')
  const autoOffered = useAutoOffered(useStoredProvider())
  const held = items.some((other) => sameItem(other, item))
  return {
    offered: enabled && (autoOffered || architectureOfItem(item) !== null),
    held,
    label: held ? t.removeFromContext : t.addToContext,
    toggle: () => {
      if (held) {
        setItems(items.filter((other) => !sameItem(other, item)))
        return
      }
      const next = addItem(items, item, autoOffered)
      if (next === items) toast.error(t.contextFull)
      else setItems(next)
      // The owner sees the item land next to the prompt.
      setOpen(true)
    },
  }
}

/**
 * What a right-click in an architecture's workspace adds to the menu of a view or of a part of
 * one: putting it in the assistant's context, or taking it out (several selected parts go in or
 * out together: out when every one is held, in otherwise). Parts that read the same in one view
 * are one item. The context is read when the menu opens: the page that calls this tells the
 * chat its workspace, and must not render again each time the chat's state changes.
 */
export function useWorkspaceContextActions(architectureId: number) {
  const t = useT().assistant
  const { readItems, setItems, setOpen } = useControls()
  const enabled = useFeature('diagram-assistant')
  const autoOffered = useAutoOffered(useStoredProvider())
  return (target: WorkspaceTarget): ItemAction[] => {
    const items = readItems()
    const viewId = Number(target.viewId)
    if (!enabled || !Number.isInteger(viewId)) return []
    const wanted = workspaceItems(target, viewId, architectureId)
    const holds = (all: readonly ContextItem[], item: ContextItem) =>
      all.some((other) => sameItem(other, item))
    const held = wanted.every((item) => holds(items, item))
    const many = wanted.length > 1
    const remove = many ? t.removeManyFromContext(wanted.length) : t.removeFromContext
    const add = many ? t.addManyToContext(wanted.length) : t.addToContext
    return [
      {
        label: held ? remove : add,
        icon: <SparklesIcon />,
        onSelect: () => {
          if (held) {
            setItems(items.filter((other) => !holds(wanted, other)))
            return
          }
          const next = wanted.reduce((all, item) => addItem(all, item, autoOffered), items)
          // Some may not fit: what fits goes in, and the owner is told.
          if (wanted.some((item) => !holds(next, item))) toast.error(t.contextFull)
          if (next !== items) setItems(next)
          setOpen(true)
        },
      },
    ]
  }
}

/** What an item's menu offers, in its "…" menu and on a right-click. */
export interface ItemAction {
  label: string
  icon?: React.ReactNode
  destructive?: boolean
  onSelect: () => void
}

/** Adding the item to the assistant's context, or taking it out; nothing while it is not offered. */
export function useContextActions(item: ContextItem): ItemAction[] {
  const { offered, label, toggle } = useContextItem(item)
  return offered ? [{ label, icon: <SparklesIcon />, onSelect: toggle }] : []
}

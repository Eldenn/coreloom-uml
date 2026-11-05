import { ListIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { DiagramEditor, type DiagramFormat, parseDiagram } from '@/components/diagram-editor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EditableText } from '@/components/ui/editable-text'
import { Popconfirm } from '@/components/ui/popconfirm'
import { type SaveState, SaveStatus } from '@/components/ui/save-status'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SortableList } from '@/components/ui/sortable-list'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { UmlDiagramKind, UmlParseResult } from '@/lib/uml'
import { cn } from '@/lib/utils'

/** One view of the document: its name and its diagram as text. */
interface DiagramWorkspaceItem {
  id: string
  title: string
  value: string
  format: DiagramFormat
}

interface DiagramWorkspaceProps {
  /** The document's name, edited in place. */
  title: string
  onTitleChange: (title: string) => void
  diagrams: readonly DiagramWorkspaceItem[]
  /** The view open in the editor. */
  activeId: string
  onActiveChange: (id: string) => void
  /**
   * The open view's text changed (typing, the drawing tools, a new format): its new text, what
   * could be read from it, and its format.
   */
  onDiagramChange: (
    id: string,
    value: string,
    result: UmlParseResult,
    format: DiagramFormat,
  ) => void
  /** "Add a diagram" with the kind picked; the app adds the view (and usually opens it). */
  onAdd: (kind: UmlDiagramKind) => void
  onRename: (id: string, title: string) => void
  /** The views' ids in their new order. */
  onReorder: (ids: string[]) => void
  /** Asked first; never offered for the last view. */
  onDelete: (id: string) => void
  saveState: SaveState
  savedAt?: Date
  onRetrySave?: () => void
  /** The app's own buttons (Share, say), at the end of the top bar. */
  actions?: React.ReactNode
  /**
   * CSS height of the whole workspace on wide screens: the editor takes what's left under the
   * top bar. `calc(100svh - 7.5rem)` fills the window in AppShell. Default: none, the editor's
   * panes are 560px tall.
   */
  height?: string
  className?: string
}

type WorkspaceText = Messages['diagramWorkspace']

const KINDS: readonly UmlDiagramKind[] = [
  'class',
  'sequence',
  'state',
  'activity',
  'usecase',
  'er',
  'c4',
  'deployment',
  'component',
  'package',
]

/** "Order flow (v2)" → "order-flow-v2", for the editor's download names. */
function downloadName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'diagram'
}

/** Puts focus on a view's button in the list, once the list has drawn. */
function focusView(list: HTMLElement | null, id?: string) {
  requestAnimationFrame(() => {
    const selector = id ? `[data-view-id="${CSS.escape(id)}"]` : '[aria-current="true"]'
    const target =
      list?.querySelector<HTMLElement>(selector) ??
      list?.querySelector<HTMLElement>('[data-view-id]')
    target?.focus()
  })
}

/** A name field in place of a view's button: Enter or leaving saves, Escape cancels. */
function RenameField({
  title,
  t,
  onDone,
}: {
  title: string
  t: WorkspaceText
  onDone: (title: string | null) => void
}) {
  const [draft, setDraft] = React.useState(title)
  const done = React.useRef(false)
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    const next = draft.trim()
    onDone(save && next !== '' && next !== title ? next : null)
  }
  return (
    <input
      type="text"
      value={draft}
      aria-label={t.nameLabel}
      // A rename is asked for with a button: the field takes focus at once.
      autoFocus
      onFocus={(e) => {
        e.currentTarget.select()
      }}
      onChange={(e) => {
        setDraft(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => {
        finish(true)
      }}
      className="h-8 min-w-0 flex-1 rounded-sm border border-primary bg-inset px-2 text-[13px] text-foreground ring-[3px] ring-ring outline-none"
    />
  )
}

function ViewRow({
  item,
  active,
  only,
  renaming,
  t,
  onOpen,
  onStartRename,
  onRenamed,
  onDelete,
}: {
  item: DiagramWorkspaceItem
  active: boolean
  only: boolean
  renaming: boolean
  t: WorkspaceText
  onOpen: () => void
  onStartRename: () => void
  onRenamed: (title: string | null) => void
  onDelete: () => void
}) {
  return (
    <li
      className={cn(
        'flex min-w-0 items-center gap-0.5 rounded-md border border-transparent p-0.5',
        active && 'border-border bg-accent',
      )}
    >
      {renaming ? (
        <RenameField title={item.title} t={t} onDone={onRenamed} />
      ) : (
        <button
          type="button"
          data-view-id={item.id}
          aria-current={active ? 'true' : undefined}
          onClick={onOpen}
          className="h-8 min-w-0 flex-1 cursor-pointer truncate rounded-sm px-2 text-left text-[13px] text-fg-secondary outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring aria-[current=true]:font-medium aria-[current=true]:text-foreground"
        >
          {item.title}
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t.rename(item.title)}
        disabled={renaming}
        onClick={onStartRename}
      >
        <PencilIcon aria-hidden />
      </Button>
      <Popconfirm
        title={t.removeTitle(item.title)}
        description={t.removeDescription}
        confirmLabel={t.removeConfirm}
        destructive
        onConfirm={onDelete}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.remove(item.title)}
          title={only ? t.lastView : undefined}
          disabled={only}
        >
          <Trash2Icon aria-hidden />
        </Button>
      </Popconfirm>
    </li>
  )
}

function AddMenu({ onAdd }: { onAdd: (kind: UmlDiagramKind) => void }) {
  const { messages } = useCoreloomI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={messages.diagramWorkspace.add}
        >
          <PlusIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {KINDS.map((kind) => (
          <DropdownMenuItem
            key={kind}
            onSelect={() => {
              onAdd(kind)
            }}
          >
            {messages.diagram.kinds[kind]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type ViewsPanelProps = Pick<
  DiagramWorkspaceProps,
  'diagrams' | 'activeId' | 'onAdd' | 'onRename' | 'onReorder' | 'onDelete'
> & {
  /** A view was opened from the list. */
  onOpen: (id: string) => void
}

/** The document's views: open, add, rename, delete, or reorder them. */
function ViewsPanel({
  diagrams,
  activeId,
  onOpen,
  onAdd,
  onRename,
  onReorder,
  onDelete,
}: ViewsPanelProps) {
  const t = useCoreloomI18n().messages.diagramWorkspace
  const [reordering, setReordering] = React.useState(false)
  const [renaming, setRenaming] = React.useState<string | null>(null)
  const list = React.useRef<HTMLDivElement>(null)
  const labelId = React.useId()
  return (
    <div ref={list} className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <p
          id={labelId}
          className="m-0 flex-1 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
        >
          {t.views}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={reordering}
          disabled={diagrams.length < 2}
          onClick={() => {
            setReordering(!reordering)
          }}
        >
          {reordering ? t.reorderDone : t.reorder}
        </Button>
        <AddMenu onAdd={onAdd} />
      </div>
      {reordering ? (
        <SortableList
          aria-label={t.order}
          numbered={false}
          options={diagrams.map((item) => ({ value: item.id, label: item.title }))}
          value={diagrams.map((item) => item.id)}
          onValueChange={onReorder}
        />
      ) : (
        <ul aria-labelledby={labelId} className="m-0 flex list-none flex-col gap-0.5 p-0">
          {diagrams.map((item) => (
            <ViewRow
              key={item.id}
              item={item}
              active={item.id === activeId}
              only={diagrams.length === 1}
              renaming={renaming === item.id}
              t={t}
              onOpen={() => {
                onOpen(item.id)
              }}
              onStartRename={() => {
                setRenaming(item.id)
              }}
              onRenamed={(title) => {
                setRenaming(null)
                if (title) onRename(item.id, title)
                focusView(list.current, item.id)
              }}
              onDelete={() => {
                onDelete(item.id)
                // The row goes away with its buttons: focus the open view instead.
                focusView(list.current)
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The editor reports a new format and its new text as two calls in one event (text first): this
 * keeps the text so the format change reports both.
 */
function useEditorReports(
  item: DiagramWorkspaceItem | undefined,
  onDiagramChange: DiagramWorkspaceProps['onDiagramChange'],
) {
  const pending = React.useRef<string | null>(null)
  const report = (value: string, format: DiagramFormat) => {
    if (!item) return
    onDiagramChange(item.id, value, parseDiagram(value, format), format)
  }
  return {
    onChange: (value: string) => {
      if (!item) return
      pending.current = value
      queueMicrotask(() => {
        pending.current = null
      })
      report(value, item.format)
    },
    onFormatChange: (format: DiagramFormat) => {
      if (!item) return
      report(pending.current ?? item.value, format)
    },
  }
}

function DiagramWorkspace({
  title,
  onTitleChange,
  diagrams,
  activeId,
  onActiveChange,
  onDiagramChange,
  onAdd,
  onRename,
  onReorder,
  onDelete,
  saveState,
  savedAt,
  onRetrySave,
  actions,
  height,
  className,
}: DiagramWorkspaceProps) {
  const t = useCoreloomI18n().messages.diagramWorkspace
  const [sheet, setSheet] = React.useState(false)
  const active = diagrams.find((item) => item.id === activeId) ?? diagrams.at(0)
  const reports = useEditorReports(active, onDiagramChange)
  const panel = { diagrams, activeId: active?.id ?? '', onAdd, onRename, onReorder, onDelete }

  return (
    <section
      data-slot="diagram-workspace"
      aria-label={title}
      className={cn(
        'flex min-w-0 flex-col gap-3',
        height && 'lg:h-(--diagram-workspace-h)',
        className,
      )}
      style={height ? ({ '--diagram-workspace-h': height } as React.CSSProperties) : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {/* The name takes its own row until the list of views moves to the side. */}
        <p className="m-0 flex min-w-0 basis-full font-display text-[20px] leading-tight font-semibold tracking-[-0.01em] lg:flex-1 lg:basis-0">
          <EditableText value={title} onValueChange={onTitleChange} label={t.titleLabel} required />
        </p>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetTrigger asChild>
            <Button type="button" variant="secondary" size="sm" className="lg:hidden">
              <ListIcon aria-hidden />
              {t.showViews(diagrams.length)}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(20rem,85vw)] gap-0 p-4">
            <SheetHeader className="p-0 pb-3">
              <SheetTitle>{t.views}</SheetTitle>
            </SheetHeader>
            <ViewsPanel
              {...panel}
              onOpen={(id) => {
                onActiveChange(id)
                setSheet(false)
              }}
            />
          </SheetContent>
        </Sheet>
        <SaveStatus state={saveState} savedAt={savedAt} onRetry={onRetrySave} />
        {actions}
      </div>
      <div
        className={cn(
          'grid min-w-0 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)]',
          height ? 'lg:min-h-0 lg:flex-1 lg:grid-rows-[minmax(0,1fr)]' : 'lg:items-start',
        )}
      >
        <nav
          aria-label={t.views}
          className={cn(
            'hidden min-w-0 lg:block',
            height && 'lg:max-h-full lg:self-start lg:overflow-y-auto',
          )}
        >
          <ViewsPanel {...panel} onOpen={onActiveChange} />
        </nav>
        {active ? (
          <DiagramEditor
            key={active.id}
            value={active.value}
            format={active.format}
            onChange={reports.onChange}
            onFormatChange={reports.onFormatChange}
            fileName={downloadName(active.title)}
            height={height ? 'fill' : undefined}
            className="min-w-0"
          />
        ) : null}
      </div>
    </section>
  )
}

export { DiagramWorkspace, type DiagramWorkspaceItem, type DiagramWorkspaceProps }

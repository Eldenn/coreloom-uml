'use client'

// Coreloom UI — DiagramViewer. A document of several diagrams to read, not edit: what a shared
// link opens. Its title, description and date on top; the views in tabs (a side list past six, a
// menu on a phone); the diagram with zoom and full screen; SVG and PNG downloads. Left and right
// arrows, or Page Up and Page Down, go to the previous or next view.
import { DownloadIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RelativeTime } from '@/components/ui/relative-time'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UmlDiagram, type UmlDiagramHandle } from '@/components/ui/uml-diagram'
import { useCoreloomI18n } from '@/lib/i18n'
import type { UmlLayout, UmlSpec } from '@/lib/uml'
import type { UmlImageFormat } from '@/lib/uml-image'
import { cn } from '@/lib/utils'

/** One view of the document: a diagram and, for drawn diagrams, where its elements were placed. */
interface DiagramViewerItem {
  id: string
  title: string
  diagram: UmlSpec
  layout?: UmlLayout
}

interface DiagramViewerProps {
  title: string
  description?: string
  /** When the document last changed: "Updated 2 hours ago". */
  updatedAt?: Date
  diagrams: readonly DiagramViewerItem[]
  /** The view shown (controlled). */
  activeId?: string
  /** Default: the first view. */
  defaultActiveId?: string
  onActiveChange?: (id: string) => void
  /** Above the title: who shared it, a read-only notice, a sign-up offer. */
  banner?: React.ReactNode
  /** Download names: "<fileName>-<view>.svg". Default: the view's name alone. */
  fileName?: string
  className?: string
}

/** Past this many views, the tabs become a list at the side. */
const MANY_VIEWS = 6

/** "Order flow (v2)" → "order-flow-v2", for file names; "diagram" when nothing is left. */
function fileSlug(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'diagram'
}

/** The view `step` away from `id`, stopping at either end; null when there's none to go to. */
function stepView(ids: readonly string[], id: string, step: number): string | null {
  const index = ids.indexOf(id) + step
  if (index < 0) return null
  return ids.at(index) ?? null
}

/** Keys that change the view, and by how much; null for any other key or a modified one. */
function viewStep(event: React.KeyboardEvent): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  switch (event.key) {
    case 'ArrowLeft':
    case 'PageUp':
      return -1
    case 'ArrowRight':
    case 'PageDown':
      return 1
    default:
      return null
  }
}

/** Fields, menus and the tab list handle their own arrows. */
function ownsArrows(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="tablist"], [role="menu"], [role="listbox"], [role="combobox"]',
    ),
  )
}

function withLayout(item: DiagramViewerItem): UmlSpec {
  if (!item.layout || item.diagram.kind === 'sequence') return item.diagram
  return { ...item.diagram, layout: item.layout }
}

function save(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

function ViewerHeader({
  title,
  description,
  updatedAt,
}: Pick<DiagramViewerProps, 'title' | 'description' | 'updatedAt'>) {
  const t = useCoreloomI18n().messages.diagramViewer
  return (
    <header className="grid min-w-0 gap-1.5">
      <h1 className="m-0 font-display text-[26px] leading-tight font-semibold tracking-[-0.02em] break-words text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="m-0 max-w-prose text-[14px] text-fg-secondary">{description}</p>
      ) : null}
      {updatedAt ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">
          {t.updated} <RelativeTime date={updatedAt} />
        </p>
      ) : null}
    </header>
  )
}

function DownloadMenu({
  onDownload,
  className,
}: {
  onDownload: (format: UmlImageFormat) => void
  className?: string
}) {
  const t = useCoreloomI18n().messages.diagramViewer
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className={cn('shrink-0', className)}>
          <DownloadIcon aria-hidden />
          {t.download}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            onDownload('svg')
          }}
        >
          {t.svg}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onDownload('png')
          }}
        >
          {t.png}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** On a phone (or past six views, below a wide screen), a menu of the views. */
function ViewPicker({
  diagrams,
  active,
  onChange,
  className,
}: {
  diagrams: readonly DiagramViewerItem[]
  active: string
  onChange: (id: string) => void
  className?: string
}) {
  const t = useCoreloomI18n().messages.diagramViewer
  return (
    <Select value={active} onValueChange={onChange}>
      <SelectTrigger aria-label={t.view} className={cn('min-w-0 flex-1', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {diagrams.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** The view shown, controlled or not, and what to say when it changes. */
function useActiveView({
  diagrams,
  activeId,
  defaultActiveId,
  onActiveChange,
}: Pick<DiagramViewerProps, 'diagrams' | 'activeId' | 'defaultActiveId' | 'onActiveChange'>) {
  const t = useCoreloomI18n().messages.diagramViewer
  const ids = diagrams.map((item) => item.id)
  const [own, setOwn] = React.useState(defaultActiveId ?? ids.at(0) ?? '')
  const wanted = activeId ?? own
  // A view the document no longer has falls back to the first one.
  const active = ids.includes(wanted) ? wanted : (ids.at(0) ?? '')
  const [said, setSaid] = React.useState('')
  const change = (id: string) => {
    if (id === active) return
    if (activeId === undefined) setOwn(id)
    onActiveChange?.(id)
    const index = ids.indexOf(id)
    setSaid(t.position(index + 1, ids.length, diagrams.at(index)?.title ?? ''))
  }
  return { ids, active, change, said, setSaid }
}

function DiagramViewer({
  title,
  description,
  updatedAt,
  diagrams,
  activeId,
  defaultActiveId,
  onActiveChange,
  banner,
  fileName,
  className,
}: DiagramViewerProps) {
  const t = useCoreloomI18n().messages.diagramViewer
  const view = useActiveView({ diagrams, activeId, defaultActiveId, onActiveChange })
  const many = diagrams.length > MANY_VIEWS
  const keysId = React.useId()
  const image = React.useRef<UmlDiagramHandle>(null)

  const download = (format: UmlImageFormat) => {
    const item = diagrams.find((d) => d.id === view.active)
    if (!item) return
    const name = fileName ? `${fileSlug(fileName)}-${fileSlug(item.title)}` : fileSlug(item.title)
    image.current
      ?.toImage(format)
      .then((url) => {
        save(url, `${name}.${format}`)
      })
      .catch(() => {
        view.setSaid(t.imageFailed)
      })
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- shortcuts for the whole viewer; the tabs and the menu stay the way to change views
    <section
      data-slot="diagram-viewer"
      aria-label={title}
      aria-describedby={keysId}
      className={cn('flex min-w-0 flex-col gap-5', className)}
      onKeyDown={(event) => {
        const step = viewStep(event)
        if (step === null || event.defaultPrevented || ownsArrows(event.target)) return
        const next = stepView(view.ids, view.active, step)
        if (!next) return
        event.preventDefault()
        view.change(next)
      }}
    >
      {banner}
      <ViewerHeader title={title} description={description} updatedAt={updatedAt} />
      <Tabs
        value={view.active}
        onValueChange={view.change}
        orientation={many ? 'vertical' : 'horizontal'}
        className={cn(
          'min-w-0',
          many && 'lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start',
        )}
      >
        <div className={cn('flex min-w-0 items-center gap-2', many && 'lg:hidden')}>
          <ViewPicker
            diagrams={diagrams}
            active={view.active}
            onChange={view.change}
            className={many ? undefined : 'sm:hidden'}
          />
          {!many && (
            <TabsList
              aria-label={t.views}
              className="hidden max-w-full overflow-x-auto sm:inline-flex"
            >
              {diagrams.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.title}
                </TabsTrigger>
              ))}
            </TabsList>
          )}
          <DownloadMenu onDownload={download} className="ml-auto" />
        </div>
        {many && (
          <div className="hidden min-w-0 flex-col gap-2 lg:flex">
            <TabsList aria-label={t.views} className="w-full items-stretch">
              {diagrams.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="justify-start">
                  <span className="truncate">{item.title}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <DownloadMenu onDownload={download} />
          </div>
        )}
        {diagrams.map((item) => (
          <TabsContent key={item.id} value={item.id} className="min-w-0">
            <UmlDiagram
              ref={item.id === view.active ? image : undefined}
              diagram={withLayout(item)}
              label={item.title}
              height="min(70svh, 640px)"
            />
          </TabsContent>
        ))}
      </Tabs>
      <p id={keysId} className="sr-only">
        {t.keys}
      </p>
      <p role="status" className="sr-only">
        {view.said}
      </p>
    </section>
  )
}

export {
  DiagramViewer,
  type DiagramViewerItem,
  type DiagramViewerProps,
  fileSlug,
  MANY_VIEWS,
  stepView,
}

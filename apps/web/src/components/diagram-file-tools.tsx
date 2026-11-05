'use client'

// Coreloom UI — Diagram file tools. The diagram editor's top bar (format, new diagram, import,
// copy, download, the view switch, the app's actions and the status line) and the list of problems
// under the text; and which format can hold which kind of diagram.
import {
  CheckIcon,
  CodeIcon,
  Columns2Icon,
  CopyIcon,
  DownloadIcon,
  FilePlusIcon,
  FileUpIcon,
  type LucideIcon,
  ShapesIcon,
} from 'lucide-react'
import * as React from 'react'

import { DIAGRAM_FILE_ACCEPT } from '@/components/diagram-import'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  Toolbar,
  ToolbarButton,
  ToolbarMenu,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
} from '@/components/ui/toolbar'
import type { Messages } from '@/lib/i18n'
import type { UmlDiagramKind, UmlProblem } from '@/lib/uml'
import type { UmlImageFormat } from '@/lib/uml-image'
import { cn } from '@/lib/utils'

type DiagramFormat = 'mermaid' | 'plantuml' | 'json'

type EditorText = Messages['diagramEditor']

/** What the editor shows: the text beside the drawing, or one of them. */
type DiagramEditorView = 'split' | 'drawing' | 'text'

const VIEWS: readonly [DiagramEditorView, LucideIcon][] = [
  ['split', Columns2Icon],
  ['drawing', ShapesIcon],
  ['text', CodeIcon],
]

function ViewSwitch({
  view,
  onView,
  t,
}: {
  view: DiagramEditorView
  onView: (view: DiagramEditorView) => void
  t: EditorText
}) {
  return (
    <ToolbarToggleGroup
      type="single"
      value={view}
      aria-label={t.view}
      onValueChange={(v) => {
        const next = VIEWS.find(([x]) => x === v)
        if (next) onView(next[0])
      }}
    >
      {VIEWS.map(([value, Icon]) => (
        <ToolbarToggleItem
          key={value}
          value={value}
          aria-label={t.views[value]}
          tooltip={t.views[value]}
        >
          <Icon aria-hidden />
        </ToolbarToggleItem>
      ))}
    </ToolbarToggleGroup>
  )
}

/**
 * True when a diagram of this kind reads back the same from text in `format`: Mermaid has no use
 * case, deployment, component or package diagrams, and PlantUML's activity syntax can't hold
 * every graph.
 */
function canWrite(kind: UmlDiagramKind, format: DiagramFormat): boolean {
  if (format === 'mermaid') return !NOT_MERMAID.has(kind)
  if (format === 'plantuml') return kind !== 'activity'
  return true
}

const NOT_MERMAID: ReadonlySet<UmlDiagramKind> = new Set([
  'usecase',
  'deployment',
  'component',
  'package',
])

const FORMATS: readonly [DiagramFormat, string][] = [
  ['mermaid', 'Mermaid'],
  ['plantuml', 'PlantUML'],
  ['json', 'JSON'],
]

const EXTENSIONS: Record<DiagramFormat, string> = { mermaid: 'mmd', plantuml: 'puml', json: 'json' }

function problemText(p: UmlProblem, t: EditorText): string {
  const what = t.problem[p.code]
  const where = p.line > 0 ? `${t.line(p.line)} · ` : ''
  // JSON and schema problems carry the parser's own detail; the rest quote the line.
  const detail = p.code === 'json' || p.code === 'schema' ? p.text : undefined
  return `${where}${what}${detail ? ` ${detail}` : ''}`
}

/** Opens the file picker; the file chosen goes to `onImport` (the same file can be picked again). */
function ImportButton({
  label,
  disabled,
  onImport,
}: {
  label: string
  disabled: boolean
  onImport: (file: File) => void
}) {
  const input = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <ToolbarButton
        disabled={disabled}
        onClick={() => {
          input.current?.click()
        }}
      >
        <FileUpIcon aria-hidden />
        <span className="max-sm:sr-only">{label}</span>
      </ToolbarButton>
      <input
        ref={input}
        type="file"
        accept={DIAGRAM_FILE_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file) onImport(file)
        }}
      />
    </>
  )
}

function FileTools({
  t,
  format,
  onFormat,
  onTemplate,
  onImport,
  onCopy,
  copied,
  onDownload,
  drawn,
  templates,
  status,
  kinds,
  kind,
  readOnly,
  view,
  onView,
  actions,
}: {
  t: EditorText
  format: DiagramFormat
  onFormat: (f: DiagramFormat) => void
  onTemplate: (text: string) => void
  /** A file picked with Import, read by the editor. */
  onImport: (file: File) => void
  onCopy: () => void
  copied: boolean
  onDownload: (what: DiagramFormat | UmlImageFormat) => void
  /** Images can be made: something is drawn (and the drawing is shown). */
  drawn: boolean
  templates: readonly { kind: UmlDiagramKind; label?: string; text: string }[]
  status: string
  kinds: Messages['diagram']['kinds']
  /** The kind drawn now: a format that can't hold it can't be picked. */
  kind: UmlDiagramKind | null
  /** Nothing here may change the text: the format, New diagram and Import are off. */
  readOnly: boolean
  view: DiagramEditorView
  onView: (view: DiagramEditorView) => void
  /** The app's own buttons, at the end of the bar. */
  actions: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1.5">
      <Toolbar aria-label={t.fileTools} variant="plain" className="flex-wrap">
        <ToolbarToggleGroup
          type="single"
          value={format}
          aria-label={t.format}
          disabled={readOnly}
          onValueChange={(v) => {
            if (v === 'mermaid' || v === 'plantuml' || v === 'json') onFormat(v)
          }}
        >
          {FORMATS.map(([value, name]) => (
            <ToolbarToggleItem
              key={value}
              value={value}
              disabled={kind !== null && !canWrite(kind, value)}
            >
              {name}
            </ToolbarToggleItem>
          ))}
        </ToolbarToggleGroup>
        <ToolbarSeparator />
        <ToolbarMenu label={t.newDiagram} icon={<FilePlusIcon aria-hidden />} disabled={readOnly}>
          {templates.map((tpl) => (
            <DropdownMenuItem
              key={tpl.label ?? tpl.kind}
              onSelect={() => {
                onTemplate(tpl.text)
              }}
            >
              {tpl.label ?? kinds[tpl.kind]}
            </DropdownMenuItem>
          ))}
        </ToolbarMenu>
        <ImportButton label={t.importFile} disabled={readOnly} onImport={onImport} />
        <ToolbarSeparator className="max-sm:hidden" />
        <ToolbarButton onClick={onCopy}>
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          <span className="max-sm:sr-only">{copied ? t.copied : t.copy}</span>
        </ToolbarButton>
        <ToolbarMenu
          label={<span className="max-sm:sr-only">{t.download}</span>}
          icon={<DownloadIcon aria-hidden />}
          align="end"
        >
          <DropdownMenuItem
            onSelect={() => {
              onDownload(format)
            }}
          >
            {t.downloadText(EXTENSIONS[format])}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {(['svg', 'png'] as const).map((image) => (
            <DropdownMenuItem
              key={image}
              disabled={!drawn || view === 'text'}
              onSelect={() => {
                onDownload(image)
              }}
            >
              {image === 'svg' ? t.downloadSvg : t.downloadPng}
            </DropdownMenuItem>
          ))}
        </ToolbarMenu>
        <ToolbarSeparator />
        <ViewSwitch view={view} onView={onView} t={t} />
      </Toolbar>
      <p
        role="status"
        className="order-last w-full min-w-0 truncate px-1 text-[12.5px] text-muted-foreground sm:order-none sm:w-auto sm:flex-1 sm:text-right"
      >
        {readOnly ? `${t.readOnly} · ${status}` : status}
      </p>
      {actions !== undefined && actions !== null && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

function ProblemList({ problems, t }: { problems: readonly UmlProblem[]; t: EditorText }) {
  if (!problems.length) return null
  return (
    <ul className="max-h-28 shrink-0 overflow-auto border-t border-border bg-inset px-3 py-2 text-[12.5px]">
      {problems.map((p, i) => (
        <li
          // eslint-disable-next-line @eslint-react/no-array-index-key -- a line can have several problems
          key={i}
          className={cn(
            'truncate',
            p.severity === 'error' ? 'text-destructive' : 'text-fg-secondary',
          )}
          title={p.text}
        >
          {problemText(p, t)}
        </li>
      ))}
    </ul>
  )
}

export { canWrite, type DiagramEditorView, type DiagramFormat, EXTENSIONS, FileTools, ProblemList }

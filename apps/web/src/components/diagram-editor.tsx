import * as React from 'react'

import { Drawing } from '@/components/diagram-drawing'
import {
  canWrite,
  type DiagramEditorView,
  type DiagramFormat,
  EXTENSIONS,
  FileTools,
  ProblemList,
} from '@/components/diagram-file-tools'
import { sniffFormat, useFileImport } from '@/components/diagram-import'
import { CodeEditor, type CodeEditorDiagnostic } from '@/components/ui/code-editor'
import type { UmlDiagramHandle } from '@/components/ui/uml-diagram'
import { useDiagramEditing } from '@/components/use-diagram-editing'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import {
  parseUmlJson,
  toUmlJson,
  type UmlDiagramKind,
  umlElementIds,
  type UmlLayout,
  type UmlParseResult,
  type UmlSpec,
} from '@/lib/uml'
import { DIRECTIONS } from '@/lib/uml-arrange'
import type { UmlImageFormat } from '@/lib/uml-image'
import { parseMermaid, toMermaid } from '@/lib/uml-mermaid'
import { isPlantUml, parsePlantUml, toPlantUml } from '@/lib/uml-plantuml'
import { cn } from '@/lib/utils'

interface DiagramEditorProps {
  /** The text (controlled), in `format`. */
  value?: string
  defaultValue?: string
  onChange?: (text: string) => void
  format?: DiagramFormat
  /** Default: mermaid. */
  defaultFormat?: DiagramFormat
  onFormatChange?: (format: DiagramFormat) => void
  /** Each time the text is read: the diagram (null when nothing could be drawn) and its problems. */
  onDiagramChange?: (result: UmlParseResult) => void
  /** Starting points under "New diagram", in Mermaid or PlantUML. Default: one per diagram type. */
  templates?: readonly { kind: UmlDiagramKind; label?: string; text: string }[]
  /**
   * CSS height of both panes on wide screens (they stack on narrow ones). `fill`: the panes take
   * what's left of the height the editor is given (stretched in a grid or a flex column, or a
   * height class). Default: 560px.
   */
  height?: string
  /** File name for Download, without the extension. Default: diagram. */
  fileName?: string
  autoFocus?: boolean
  /** Text beside the drawing (`split`), the drawing alone or the text alone (controlled). */
  view?: DiagramEditorView
  /** Default: split. */
  defaultView?: DiagramEditorView
  onViewChange?: (view: DiagramEditorView) => void
  /** The app's own buttons (Share, say), at the end of the top bar. */
  actions?: React.ReactNode
  /**
   * The text can't be changed: no drawing tools, properties or dragging, and the format and New
   * diagram are off. Copy, Download, zoom and full screen stay. Default: false.
   */
  readOnly?: boolean
  className?: string
}

const DIAGRAM_TEMPLATES: readonly { kind: UmlDiagramKind; text: string }[] = [
  {
    kind: 'class',
    text: `classDiagram
  class Order {
    +String id
    +place() void
  }
  class LineItem {
    +int quantity
  }
  Order *-- LineItem`,
  },
  {
    kind: 'sequence',
    text: `sequenceDiagram
  actor User
  participant App
  User->>App: Sign in
  App-->>User: Welcome`,
  },
  {
    kind: 'state',
    text: `stateDiagram-v2
  [*] --> Draft
  Draft --> Published : publish
  Published --> [*]`,
  },
  {
    kind: 'er',
    text: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    string id PK
    string email
  }`,
  },
  {
    kind: 'c4',
    text: `C4Context
  Person(user, "User")
  System(app, "Our app", "What we build")
  Rel(user, app, "Uses")`,
  },
  {
    kind: 'usecase',
    text: `@startuml
left to right direction
actor Customer
rectangle Shop {
  usecase "Place an order" as Order
  usecase "Pay" as Pay
}
Customer -- Order
Order ..> Pay : <<include>>
@enduml`,
  },
  {
    kind: 'activity',
    text: `flowchart TB
  start@{ shape: sm-circ }
  Fill("Fill the cart")
  Paid{"Paid?"}
  Ship("Ship the order")
  done@{ shape: fr-circ }
  start --> Fill --> Paid
  Paid -->|yes| Ship --> done
  Paid -->|no| Fill`,
  },
  {
    kind: 'deployment',
    text: `@startuml
node "Web server" as web {
  artifact "app.jar" as app
}
database "PostgreSQL" as db
web -- db : JDBC
@enduml`,
  },
  {
    kind: 'component',
    text: `@startuml
left to right direction
component "Checkout" as checkout {
  port "api" as api
  component "Cart" as cart
}
interface "Payments" as payments
component "Payment service" as pay
api --> cart : <<delegate>>
pay -- payments
checkout -( payments
@enduml`,
  },
  {
    kind: 'package',
    text: `@startuml
package "Web" as web {
  class "OrderController" as controller
}
package "Domain" as domain {
  class "Order" as order
}
package "Persistence" as persistence {
}
web ..> domain : <<import>>
persistence ..> domain
@enduml`,
  },
]

/** Reads text in any of the formats. */
function parseDiagram(text: string, format: DiagramFormat): UmlParseResult {
  switch (format) {
    case 'json':
      return parseUmlJson(text)
    case 'plantuml':
      return parsePlantUml(text)
    case 'mermaid':
      return parseMermaid(text)
  }
}

/** The diagram as text in `format`, with the positions people dragged (JSON keeps them). */
function writeDiagram(diagram: UmlSpec, format: DiagramFormat): string {
  switch (format) {
    case 'json':
      return toUmlJson(diagram)
    case 'plantuml':
      return toPlantUml(diagram)
    case 'mermaid':
      return toMermaid(diagram)
  }
}

/**
 * A template's text in the current format when that format can hold its kind; otherwise as
 * written, in the format it's written in.
 */
function templateIn(
  template: string,
  format: DiagramFormat,
): { text: string; format: DiagramFormat } {
  const own: DiagramFormat = isPlantUml(template) ? 'plantuml' : 'mermaid'
  const read = parseDiagram(template, own).diagram
  if (format !== own && read && canWrite(read.kind, format))
    return { text: writeDiagram(read, format), format }
  return { text: template, format: own }
}

/**
 * The format to switch to when `next` is text pasted in another syntax; null when typing (a few
 * characters changed) or when it says nothing clear.
 */
function pastedFormat(next: string, previous: string, format: DiagramFormat): DiagramFormat | null {
  if (Math.abs(next.length - previous.length) <= 8) return null
  const sniffed = sniffFormat(next)
  return sniffed && sniffed !== format ? sniffed : null
}

/** Positions only for elements the diagram still has. */
function withLayout(diagram: UmlSpec, layout: UmlLayout | null): UmlSpec {
  if (diagram.kind === 'sequence' || !layout) return diagram
  const ids = new Set(umlElementIds(diagram))
  const kept = Object.fromEntries(Object.entries(layout).filter(([id]) => ids.has(id)))
  const { layout: _old, ...rest } = diagram
  return Object.keys(kept).length ? { ...rest, layout: kept } : rest
}

/** What the editor shows about a reading: the diagram, its name, the status line, the marks. */
function readout(result: UmlParseResult, layout: UmlLayout | null, messages: Messages) {
  const t = messages.diagramEditor
  const diagram = result.diagram ? withLayout(result.diagram, layout) : null
  const kindName = diagram ? messages.diagram.kinds[diagram.kind] : null
  const count = result.problems.length
  const status =
    diagram && kindName && !count
      ? t.status(kindName, umlElementIds(diagram).length)
      : t.problems(count)
  const diagnostics: CodeEditorDiagnostic[] = result.problems
    .filter((p) => p.line > 0)
    .map((p) => ({ line: p.line, severity: p.severity, message: t.problem[p.code] }))
  const invalid = result.problems.some((p) => p.severity === 'error')
  const drawingLabel = kindName ? `${t.preview}: ${kindName}` : t.preview
  return { diagram, kind: diagram?.kind ?? null, drawingLabel, status, diagnostics, invalid }
}

/**
 * The directions the text can keep: Mermaid's C4 has none, PlantUML only left to right (only JSON
 * keeps every one).
 */
function keptDirections(diagram: UmlSpec | null, format: DiagramFormat) {
  if (format === 'json') return DIRECTIONS
  if (format === 'plantuml')
    return diagram?.kind === 'c4' ? [] : DIRECTIONS.filter((d) => d === 'TB' || d === 'LR')
  return diagram?.kind === 'c4' ? [] : DIRECTIONS
}

/** A Mermaid flowchart has no notes: an activity diagram's notes live in PlantUML and JSON only. */
function keepsNotes(diagram: UmlSpec | null, format: DiagramFormat) {
  return !(format === 'mermaid' && diagram?.kind === 'activity')
}

/** Hands a URL to the browser as a file download. */
function save(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
}

/** Download as text, or as an image of the drawing; `failed` when an image couldn't be made. */
function useDownload({
  image,
  fileName,
  format,
  text,
}: {
  image: React.RefObject<UmlDiagramHandle | null>
  fileName: string
  format: DiagramFormat
  /** The text to save, read when asked. */
  text: () => string
}) {
  const [failed, setFailed] = React.useState(false)
  const download = (what: DiagramFormat | UmlImageFormat) => {
    if (what === 'svg' || what === 'png') {
      setFailed(false)
      image.current
        ?.toImage(what)
        .then((url) => {
          save(url, `${fileName}.${what}`)
        })
        .catch(() => {
          setFailed(true)
        })
      return
    }
    const blob = new Blob([text()], { type: format === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    save(url, `${fileName}.${EXTENSIONS[format]}`)
    URL.revokeObjectURL(url)
  }
  return { download, failed }
}

function useControlled<T>(value: T | undefined, initial: T, onChange?: (next: T) => void) {
  const [own, setOwn] = React.useState(initial)
  const current = value ?? own
  const set = (next: T) => {
    if (value === undefined) setOwn(next)
    onChange?.(next)
  }
  return [current, set] as const
}

/** "Copied" for a moment after copying text. */
function useCopy(text: () => string) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    void navigator.clipboard.writeText(text()).then(() => {
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 1600)
    })
  }
  return { copied, copy }
}

const GRID: Record<DiagramEditorView, string> = {
  split: 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
  drawing: '',
  text: '',
}

/**
 * How tall the panes are on wide screens: a fixed height, or (`fill`) what's left of the editor's
 * own height. Where the panes stack they keep the fixed one, 560px when filling.
 */
function paneHeight(height: string) {
  const fill = height === 'fill'
  return {
    style: { '--diagram-editor-h': fill ? '560px' : height } as React.CSSProperties,
    className: fill ? 'lg:flex-1 lg:grid-rows-[minmax(0,1fr)]' : 'lg:h-(--diagram-editor-h)',
  }
}

/** The text, its marks and the problems under it. */
function TextPane({
  view,
  label,
  problems,
  format,
  fileName,
  invalid,
  ...editor
}: React.ComponentProps<typeof CodeEditor> & {
  view: DiagramEditorView
  format: DiagramFormat
  fileName: string
  /** The text has errors. */
  invalid: boolean
  /** Names the text field. */
  label: React.ReactNode
  problems: React.ReactNode
}) {
  const id = React.useId()
  const split = view === 'split'
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col',
        split && 'border-b border-border lg:border-r lg:border-b-0',
      )}
    >
      <p id={`${id}-source`} className="sr-only">
        {label}
      </p>
      <div
        className={cn(
          'min-h-0 lg:h-auto lg:flex-1',
          split ? 'h-[280px]' : 'h-(--diagram-editor-h)',
        )}
      >
        <CodeEditor
          {...editor}
          language={format === 'json' ? 'json' : 'text'}
          path={`${fileName}.${EXTENSIONS[format]}`}
          height="100%"
          className="h-full"
          aria-labelledby={`${id}-source`}
          {...(invalid ? { 'aria-invalid': true } : {})}
        />
      </div>
      {problems}
    </div>
  )
}

function DiagramEditor({
  value,
  defaultValue = DIAGRAM_TEMPLATES[0]?.text ?? '',
  onChange,
  format: formatProp,
  defaultFormat = 'mermaid',
  onFormatChange,
  onDiagramChange,
  templates = DIAGRAM_TEMPLATES,
  height = '560px',
  fileName = 'diagram',
  autoFocus = false,
  view: viewProp,
  defaultView = 'split',
  onViewChange,
  actions,
  readOnly = false,
  className,
}: DiagramEditorProps) {
  const { messages } = useCoreloomI18n()
  const t = messages.diagramEditor
  const [text, setText] = useControlled(value, defaultValue, onChange)
  const [format, setFormat] = useControlled(formatProp, defaultFormat, onFormatChange)
  const [view, setView] = useControlled(viewProp, defaultView, onViewChange)
  // Positions dragged on the canvas; null until someone drags (the JSON's own layout applies).
  const [layout, setLayout] = React.useState<UmlLayout | null>(null)

  // Text the tools wrote is read at once (the panels follow the new ids); typing is read when
  // there's time.
  const [written, setWritten] = React.useState<string | null>(null)
  const deferred = React.useDeferredValue(text)
  const source = text === written ? text : deferred
  const result = React.useMemo(() => parseDiagram(source, format), [source, format])
  const { diagram, kind, drawingLabel, status, diagnostics, invalid } = readout(
    result,
    layout,
    messages,
  )
  const editing = useDiagramEditing({
    diagram,
    text,
    layout,
    write: (d) => writeDiagram(d, format),
    setText: (next) => {
      setWritten(next)
      setText(next)
    },
    setLayout,
    t: messages.diagramTools,
  })

  const reported = React.useRef<UmlParseResult | null>(null)
  React.useEffect(() => {
    // Tell the app once per reading, not once per render.
    if (reported.current === result) return
    reported.current = result
    onDiagramChange?.(result)
  }, [result, onDiagramChange])

  const exported = () => (diagram ? writeDiagram(diagram, format) : text)

  const switchFormat = (next: DiagramFormat) => {
    if (next === format) return
    editing.reset()
    // Convert what could be read; text that couldn't stays as it is.
    if (diagram && canWrite(diagram.kind, next)) setText(writeDiagram(diagram, next))
    setFormat(next)
  }

  const changeFormat = (next: DiagramFormat) => {
    if (next !== format) setFormat(next)
  }

  // New text from a template or a file: a fresh start, without the dragged positions.
  const replaceText = (next: { text: string; format: DiagramFormat }) => {
    editing.reset()
    setLayout(null)
    setText(next.text)
    changeFormat(next.format)
  }

  const imports = useFileImport({ format, t, onRead: replaceText })

  const applyTemplate = (template: string) => {
    imports.clear()
    replaceText(templateIn(template, format))
  }

  const type = (next: string) => {
    imports.clear()
    editing.reset()
    setText(next)
    changeFormat(pastedFormat(next, text, format) ?? format)
  }

  const image = React.useRef<UmlDiagramHandle>(null)
  const { download, failed } = useDownload({ image, fileName, format, text: exported })
  const { copied, copy } = useCopy(exported)
  const notice = failed ? t.imageFailed : [editing.notice, imports.notice].find(Boolean)
  const panes = paneHeight(height)

  return (
    <section
      data-slot="diagram-editor"
      aria-label={t.label}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card',
        className,
      )}
      style={panes.style}
    >
      <FileTools
        t={t}
        format={format}
        onFormat={switchFormat}
        onTemplate={applyTemplate}
        onImport={imports.importFile}
        onCopy={copy}
        copied={copied}
        onDownload={download}
        drawn={Boolean(diagram)}
        templates={templates}
        status={[notice, status].filter(Boolean).join(' · ')}
        kinds={messages.diagram.kinds}
        kind={kind}
        readOnly={readOnly}
        view={view}
        onView={setView}
        actions={actions}
      />
      <div className={cn('grid min-h-0', panes.className, GRID[view])}>
        {view !== 'drawing' && (
          <TextPane
            view={view}
            label={t.source}
            value={text}
            onChange={type}
            readOnly={readOnly}
            format={format}
            fileName={fileName}
            invalid={invalid}
            diagnostics={diagnostics}
            autoFocus={autoFocus}
            problems={<ProblemList problems={result.problems} t={t} />}
          />
        )}
        {view !== 'text' && (
          <Drawing
            diagram={diagram}
            label={drawingLabel}
            locked={result.problems.length > 0}
            readOnly={readOnly}
            editing={editing}
            directions={keptDirections(diagram, format)}
            notes={keepsNotes(diagram, format)}
            imageRef={image}
            onLayoutChange={setLayout}
          />
        )}
      </div>
    </section>
  )
}

export {
  canWrite,
  DIAGRAM_TEMPLATES,
  DiagramEditor,
  type DiagramEditorProps,
  type DiagramEditorView,
  type DiagramFormat,
  parseDiagram,
  writeDiagram,
}

import {
  AppWindowIcon,
  BoxIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CircleStopIcon,
  CircleXIcon,
  ClipboardPasteIcon,
  CloudIcon,
  Columns2Icon,
  Columns3Icon,
  ContainerIcon,
  CopyIcon,
  CopyPlusIcon,
  DatabaseIcon,
  DiamondIcon,
  FileTextIcon,
  FrameIcon,
  GitBranchIcon,
  GitMergeIcon,
  GlobeIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  ListOrderedIcon,
  type LucideIcon,
  MergeIcon,
  OctagonXIcon,
  PlayIcon,
  PlusIcon,
  PuzzleIcon,
  RectangleEllipsisIcon,
  RectangleHorizontalIcon,
  Redo2Icon,
  RepeatIcon,
  ServerIcon,
  ShieldAlertIcon,
  SmartphoneIcon,
  SplineIcon,
  SplitIcon,
  SquareDashedIcon,
  SquareUserIcon,
  StickyNoteIcon,
  TableIcon,
  Trash2Icon,
  Undo2Icon,
  UserRoundIcon,
  UserRoundXIcon,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Toolbar, ToolbarButton, ToolbarMenu, ToolbarSeparator } from '@/components/ui/toolbar'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { UmlDirection, UmlSpec } from '@/lib/uml'
import { DIRECTIONS } from '@/lib/uml-arrange'
import {
  type AddRelationInput,
  elementTypes,
  relationEnds,
  relationTypes,
  START_END,
  UML_DRAG_TYPE,
  type UmlElementType,
  type UmlRelationType,
} from '@/lib/uml-edit'

type ToolsText = Messages['diagramTools']

const ICONS: Record<UmlElementType, LucideIcon> = {
  class: BoxIcon,
  interface: CircleDotIcon,
  abstract: SquareDashedIcon,
  enumeration: ListIcon,
  note: StickyNoteIcon,
  state: RectangleHorizontalIcon,
  choice: DiamondIcon,
  fork: SplitIcon,
  join: MergeIcon,
  entity: TableIcon,
  participant: SquareUserIcon,
  actor: UserRoundIcon,
  person: UserRoundIcon,
  externalPerson: UserRoundXIcon,
  system: AppWindowIcon,
  externalSystem: GlobeIcon,
  container: ContainerIcon,
  database: DatabaseIcon,
  queue: ListOrderedIcon,
  component: PuzzleIcon,
  boundary: FrameIcon,
  loop: RepeatIcon,
  alt: GitBranchIcon,
  opt: CircleDashedIcon,
  par: Columns2Icon,
  critical: ShieldAlertIcon,
  break: OctagonXIcon,
  usecase: CircleIcon,
  subject: FrameIcon,
  action: RectangleEllipsisIcon,
  decision: DiamondIcon,
  merge: GitMergeIcon,
  start: PlayIcon,
  end: CircleStopIcon,
  flowEnd: CircleXIcon,
  partition: Columns3Icon,
  node: ServerIcon,
  device: SmartphoneIcon,
  environment: LayersIcon,
  artifact: FileTextIcon,
  cloud: CloudIcon,
}

/** How many element tools sit in the bar itself on wide screens; all of them are under Add. */
const QUICK = 4

interface DiagramToolsProps {
  /** The diagram being edited; null when the text can't be drawn. */
  diagram: UmlSpec | null
  /** The text has problems: the tools would write it again and lose what couldn't be read. */
  locked: boolean
  /** Nothing may change: every tool is off, without the "fix the text" note. Default: false. */
  readOnly?: boolean
  /** Prefills the connect form: the first two selected elements. */
  selected: readonly string[]
  canDelete: boolean
  canCopy: boolean
  canPaste: boolean
  canUndo: boolean
  canRedo: boolean
  /** The way the diagram flows, for the Layout menu; null hides it (sequence diagrams). */
  direction: UmlDirection | null
  /** The directions the current format can keep (Mermaid has none for C4). Default: all. */
  directions?: readonly UmlDirection[]
  onAdd: (type: UmlElementType) => void
  onConnect: (input: AddRelationInput) => void
  onDelete: () => void
  onCopy: () => void
  onPaste: () => void
  onDuplicate: () => void
  onArrange: () => void
  onDirection: (direction: UmlDirection) => void
  onUndo: () => void
  onRedo: () => void
}

function ElementTools({
  types,
  disabled,
  onAdd,
  t,
}: {
  types: readonly UmlElementType[]
  disabled: boolean
  onAdd: (type: UmlElementType) => void
  t: ToolsText
}) {
  // The editor moves focus to the new element's name: the closing menu mustn't take it back.
  const chosen = React.useRef(false)
  return (
    <>
      <ToolbarMenu
        label={t.add}
        icon={<PlusIcon aria-hidden />}
        disabled={disabled}
        onCloseAutoFocus={(event) => {
          if (chosen.current) event.preventDefault()
          chosen.current = false
        }}
      >
        {types.map((type) => {
          const Icon = ICONS[type]
          return (
            <DropdownMenuItem
              key={type}
              onSelect={() => {
                chosen.current = true
                onAdd(type)
              }}
            >
              <Icon aria-hidden />
              {t.elements[type]}
            </DropdownMenuItem>
          )
        })}
      </ToolbarMenu>
      {types.slice(0, QUICK).map((type) => {
        const Icon = ICONS[type]
        return (
          <ToolbarButton
            key={type}
            aria-label={`${t.add}: ${t.elements[type]}`}
            tooltip={t.dragHint(t.elements[type])}
            disabled={disabled}
            className="max-sm:hidden"
            draggable={!disabled}
            onDragStart={(event) => {
              event.dataTransfer.setData(UML_DRAG_TYPE, type)
              event.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => {
              onAdd(type)
            }}
          >
            <Icon aria-hidden />
          </ToolbarButton>
        )
      })}
    </>
  )
}

function endName(id: string, name: string, side: 'from' | 'to', t: ToolsText) {
  if (id !== START_END) return name
  return side === 'from' ? t.form.start : t.form.end
}

/** The connect form: kind, both ends and a label. Enter connects. */
function ConnectForm({
  diagram,
  selected,
  onConnect,
  t,
}: {
  diagram: UmlSpec
  selected: readonly string[]
  onConnect: (input: AddRelationInput) => void
  t: ToolsText
}) {
  const id = React.useId()
  const types = relationTypes(diagram)
  const ends = relationEnds(diagram)
  const ids = ends.map((e) => e.id)
  const real = ids.filter((x) => x !== START_END)
  const pick = (want: string | undefined, fallback: string | undefined) =>
    want && ids.includes(want) ? want : (fallback ?? '')
  const [type, setType] = React.useState<UmlRelationType>(types[0] ?? 'association')
  const [from, setFrom] = React.useState(() => pick(selected[0], real[0]))
  const [to, setTo] = React.useState(() =>
    pick(
      selected[1],
      real.find((x) => x !== from),
    ),
  )
  const [label, setLabel] = React.useState('')
  const ready = Boolean(from && to) && !(from === START_END && to === START_END)

  const field = 'grid gap-1.5'
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) onConnect({ type, from, to, label })
      }}
      aria-labelledby={`${id}-title`}
    >
      <p id={`${id}-title`} className="text-[13px] font-semibold text-foreground">
        {t.form.title}
      </p>
      {types.length > 1 && (
        <div className={field}>
          <Label htmlFor={`${id}-kind`}>{t.form.kind}</Label>
          <NativeSelect
            id={`${id}-kind`}
            size="sm"
            value={type}
            onChange={(e) => {
              const next = types.find((x) => x === e.target.value)
              if (next) setType(next)
            }}
          >
            {types.map((x) => (
              <option key={x} value={x}>
                {t.relations[x]}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {(['from', 'to'] as const).map((side) => (
        <div key={side} className={field}>
          <Label htmlFor={`${id}-${side}`}>{t.form[side]}</Label>
          <NativeSelect
            id={`${id}-${side}`}
            size="sm"
            value={side === 'from' ? from : to}
            onChange={(e) => {
              if (side === 'from') setFrom(e.target.value)
              else setTo(e.target.value)
            }}
          >
            {ends.map((end) => (
              <option key={end.id} value={end.id}>
                {endName(end.id, end.name, side, t)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ))}
      <div className={field}>
        <Label htmlFor={`${id}-label`}>{t.form.label}</Label>
        <Input
          id={`${id}-label`}
          className="h-8 text-[13px]"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
          }}
        />
      </div>
      <p className="text-[12px] text-muted-foreground">{t.form.hint}</p>
      <Button type="submit" size="sm" disabled={!ready}>
        <SplineIcon aria-hidden />
        {t.form.submit}
      </Button>
    </form>
  )
}

function ConnectTool({
  diagram,
  disabled,
  selected,
  onConnect,
  t,
}: {
  diagram: UmlSpec | null
  disabled: boolean
  selected: readonly string[]
  onConnect: (input: AddRelationInput) => void
  t: ToolsText
}) {
  const [open, setOpen] = React.useState(false)
  const enough = diagram ? relationEnds(diagram).length >= 2 : false
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <ToolbarButton asChild disabled={disabled || !enough}>
        <PopoverTrigger>
          <SplineIcon aria-hidden />
          {t.connect}
        </PopoverTrigger>
      </ToolbarButton>
      <PopoverContent align="start" className="w-72">
        {diagram && (
          <ConnectForm
            diagram={diagram}
            selected={selected}
            t={t}
            onConnect={(input) => {
              onConnect(input)
              setOpen(false)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function LayoutMenu({
  direction,
  directions = DIRECTIONS,
  disabled,
  onArrange,
  onDirection,
  t,
}: {
  direction: UmlDirection
  directions?: readonly UmlDirection[] | undefined
  disabled: boolean
  onArrange: () => void
  onDirection: (direction: UmlDirection) => void
  t: ToolsText
}) {
  return (
    <ToolbarMenu
      label={<span className="max-sm:sr-only">{t.layout}</span>}
      icon={<LayoutGridIcon aria-hidden />}
      disabled={disabled}
    >
      <DropdownMenuItem onSelect={onArrange}>
        <LayoutGridIcon aria-hidden />
        {t.arrange}
      </DropdownMenuItem>
      {directions.length > 1 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t.flow}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={direction}
            onValueChange={(v) => {
              const next = directions.find((d) => d === v)
              if (next) onDirection(next)
            }}
          >
            {directions.map((d) => (
              <DropdownMenuRadioItem key={d} value={d}>
                {t.directions[d]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </>
      )}
    </ToolbarMenu>
  )
}

function ClipboardTools({
  disabled,
  canCopy,
  canPaste,
  onCopy,
  onPaste,
  onDuplicate,
  t,
}: {
  disabled: boolean
  canCopy: boolean
  canPaste: boolean
  onCopy: () => void
  onPaste: () => void
  onDuplicate: () => void
  t: ToolsText
}) {
  const tools = [
    { label: t.copy, icon: CopyIcon, on: canCopy, run: onCopy, keys: 'C' },
    { label: t.paste, icon: ClipboardPasteIcon, on: canPaste, run: onPaste, keys: 'V' },
    { label: t.duplicate, icon: CopyPlusIcon, on: canCopy, run: onDuplicate, keys: 'D' },
  ]
  return tools.map(({ label, icon: Icon, on, run, keys }) => (
    <ToolbarButton
      key={label}
      aria-label={label}
      aria-keyshortcuts={`Control+${keys} Meta+${keys}`}
      tooltip={label}
      disabled={disabled || !on}
      onClick={run}
    >
      <Icon aria-hidden />
    </ToolbarButton>
  ))
}

function DiagramTools({
  diagram,
  locked,
  readOnly = false,
  selected,
  canDelete,
  canCopy,
  canPaste,
  canUndo,
  canRedo,
  direction,
  directions,
  onAdd,
  onConnect,
  onDelete,
  onCopy,
  onPaste,
  onDuplicate,
  onArrange,
  onDirection,
  onUndo,
  onRedo,
}: DiagramToolsProps) {
  const t = useCoreloomI18n().messages.diagramTools
  const disabled = locked || readOnly || !diagram
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const redoRef = React.useRef<HTMLButtonElement>(null)
  /** After Undo or Redo: if that button just got disabled, focus the other one. */
  const keepFocus = (which: 'undo' | 'redo') => {
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (active instanceof HTMLButtonElement && !active.disabled) return
      const other = which === 'undo' ? redoRef.current : undoRef.current
      if (other && !other.disabled) other.focus()
    })
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-2 py-1">
      <Toolbar aria-label={t.label} variant="plain" className="flex-wrap">
        <ElementTools
          types={diagram ? elementTypes(diagram) : []}
          disabled={disabled}
          onAdd={onAdd}
          t={t}
        />
        <ToolbarSeparator />
        <ConnectTool
          diagram={diagram}
          disabled={disabled}
          selected={selected}
          onConnect={onConnect}
          t={t}
        />
        <ToolbarButton
          aria-label={t.delete}
          tooltip={t.delete}
          disabled={disabled || !canDelete}
          onClick={onDelete}
        >
          <Trash2Icon aria-hidden />
        </ToolbarButton>
        <ToolbarSeparator />
        <ClipboardTools
          disabled={disabled}
          canCopy={canCopy}
          canPaste={canPaste}
          onCopy={onCopy}
          onPaste={onPaste}
          onDuplicate={onDuplicate}
          t={t}
        />
        {direction && (
          <>
            <ToolbarSeparator />
            <LayoutMenu
              direction={direction}
              directions={directions}
              disabled={disabled}
              onArrange={onArrange}
              onDirection={onDirection}
              t={t}
            />
          </>
        )}
        <ToolbarSeparator />
        <ToolbarButton
          ref={undoRef}
          aria-label={t.undo}
          tooltip={t.undo}
          disabled={readOnly || !canUndo}
          onClick={() => {
            onUndo()
            keepFocus('undo')
          }}
        >
          <Undo2Icon aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          ref={redoRef}
          aria-label={t.redo}
          tooltip={t.redo}
          disabled={readOnly || !canRedo}
          onClick={() => {
            onRedo()
            keepFocus('redo')
          }}
        >
          <Redo2Icon aria-hidden />
        </ToolbarButton>
      </Toolbar>
      {locked && !readOnly && diagram && (
        <p className="text-[12px] text-muted-foreground">{t.needsFix}</p>
      )}
    </div>
  )
}

export { DiagramTools, type DiagramToolsProps }

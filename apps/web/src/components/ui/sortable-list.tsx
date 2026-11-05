import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface SortableOption {
  value: string
  /** A string: it also names the handle and the buttons ("Move Security up"). */
  label: string
  description?: string
  icon?: React.ReactNode
}

function SortableRow({
  option,
  index,
  total,
  numbered,
  disabled,
  onMove,
}: {
  option: SortableOption
  index: number
  total: number
  numbered: boolean
  disabled?: boolean
  onMove: (from: number, to: number) => void
}) {
  const t = useCoreloomI18n().messages.inputs.sortable
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: option.value, disabled })
  return (
    <li
      ref={setNodeRef}
      data-slot="sortable-item"
      data-value={option.value}
      data-dragging={isDragging || undefined}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      className="relative flex items-center gap-2 rounded-md border border-border bg-card py-1.5 pr-1.5 pl-1 text-[14px] text-foreground data-dragging:z-10 data-dragging:shadow-lg"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={t.handle(option.label)}
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55"
      >
        <GripVerticalIcon aria-hidden className="size-4" />
      </button>
      {numbered && (
        <span
          aria-hidden
          className="w-5 shrink-0 text-center font-mono text-[12px] text-muted-foreground tabular-nums"
        >
          {index + 1}
        </span>
      )}
      {option.icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{option.label}</span>
        {option.description ? (
          <span className="truncate text-[12px] text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        data-move="up"
        aria-label={t.moveUp(option.label)}
        disabled={(disabled ?? false) || index === 0}
        onClick={() => {
          onMove(index, index - 1)
        }}
      >
        <ChevronUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        data-move="down"
        aria-label={t.moveDown(option.label)}
        disabled={(disabled ?? false) || index === total - 1}
        onClick={() => {
          onMove(index, index + 1)
        }}
      >
        <ChevronDownIcon />
      </Button>
    </li>
  )
}

function SortableList({
  options,
  value,
  defaultValue,
  onValueChange,
  numbered = true,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  options: SortableOption[]
  /** The values in their order; options missing from it go at the end. */
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  /** Shows each item's rank (1, 2, 3…). */
  numbered?: boolean
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.inputs.sortable
  const [inner, setInner] = React.useState<string[]>(
    () => defaultValue ?? options.map((o) => o.value),
  )
  const order = value ?? inner
  const byValue = new Map(options.map((o) => [o.value, o]))
  const ordered = [
    ...order.flatMap((v) => byValue.get(v) ?? []),
    ...options.filter((o) => !order.includes(o.value)),
  ]
  const ids = ordered.map((o) => o.value)
  const [status, setStatus] = React.useState('')
  const listRef = React.useRef<HTMLOListElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const labelOf = (id: string | number) => byValue.get(String(id))?.label ?? String(id)
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1

  const move = (from: number, to: number, announce = true) => {
    if (to < 0 || to >= ids.length || from === to) return
    const next = arrayMove(ids, from, to)
    if (value === undefined) setInner(next)
    onValueChange?.(next)
    const moved = ids.at(from)
    if (!announce || moved === undefined) return
    setStatus(t.dropped(labelOf(moved), to + 1, ids.length))
    // Keep the focus on the moved item's button, or its other one once it reaches an end.
    const dir = to < from ? 'up' : 'down'
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-value="${CSS.escape(moved)}"]`)
      const button =
        row?.querySelector<HTMLButtonElement>(`[data-move="${dir}"]:not(:disabled)`) ??
        row?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)')
      button?.focus()
    })
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t.picked(labelOf(active.id), positionOf(active.id)),
    onDragOver: ({ active, over }) =>
      over ? t.over(labelOf(active.id), positionOf(over.id), ids.length) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t.dropped(labelOf(active.id), positionOf(over.id), ids.length) : undefined,
    onDragCancel: ({ active }) => t.cancelled(labelOf(active.id)),
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.instructions } }}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (over) move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)), false)
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol
          ref={listRef}
          data-slot="sortable-list"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          className={cn('m-0 flex list-none flex-col gap-1.5 p-0', className)}
        >
          {ordered.map((option, index) => (
            <SortableRow
              key={option.value}
              option={option}
              index={index}
              total={ordered.length}
              numbered={numbered}
              disabled={disabled}
              onMove={move}
            />
          ))}
        </ol>
      </SortableContext>
      <span role="status" className="sr-only">
        {status}
      </span>
    </DndContext>
  )
}

export { SortableList, type SortableOption }

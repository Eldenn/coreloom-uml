import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface TransferOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

function TransferPane({
  title,
  items,
  marked,
  onMark,
  filterLabel,
  disabled,
}: {
  title: string
  items: TransferOption[]
  marked: Set<string>
  onMark: (value: string, on: boolean) => void
  filterLabel: string
  disabled?: boolean
}) {
  const t = useCoreloomI18n().messages.inputs.transfer
  const [filter, setFilter] = React.useState('')
  const titleId = React.useId()
  const q = filter.trim().toLowerCase()
  const shown = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <span id={titleId} className="text-[13px] font-medium text-foreground">
          {title}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {t.count(items.filter((i) => marked.has(i.value)).length, items.length)}
        </span>
      </div>
      <div className="border-b border-border-subtle p-2">
        <input
          type="search"
          value={filter}
          placeholder={filterLabel}
          aria-label={`${filterLabel} (${title})`}
          disabled={disabled}
          className="h-8 w-full rounded-sm border border-input bg-inset px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring"
          onChange={(e) => {
            setFilter(e.target.value)
          }}
        />
      </div>
      <ul className="m-0 h-56 list-none overflow-y-auto p-1">
        {shown.length === 0 && (
          <li className="px-2 py-6 text-center text-[13px] text-muted-foreground">{t.empty}</li>
        )}
        {shown.map((item) => (
          <li key={item.value}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-sm px-2 py-1.5 text-[13px] text-foreground hover:bg-accent has-focus-visible:ring-[3px] has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-55">
              <input
                type="checkbox"
                checked={marked.has(item.value)}
                disabled={(disabled ?? false) || (item.disabled ?? false)}
                onChange={(e) => {
                  onMark(item.value, e.target.checked)
                }}
                className="mt-0.5 size-4 shrink-0 cursor-[inherit] accent-primary outline-none"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{item.label}</span>
                {item.description ? (
                  <span className="truncate text-[12px] text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TransferList({
  options,
  value,
  defaultValue = [],
  onValueChange,
  availableLabel,
  selectedLabel,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
}: {
  options: TransferOption[]
  /** The selected items' values. */
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
  /** Titles of the two lists; default to the i18n "Available" and "Selected". */
  availableLabel?: string
  selectedLabel?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
}) {
  const t = useCoreloomI18n().messages.inputs.transfer
  const [inner, setInner] = React.useState(defaultValue)
  const chosen = value ?? inner
  const [marked, setMarked] = React.useState<Set<string>>(() => new Set())
  const [announce, setAnnounce] = React.useState('')

  const available = options.filter((o) => !chosen.includes(o.value))
  const selected = options.filter((o) => chosen.includes(o.value))
  const markedIn = (list: TransferOption[]) =>
    list.filter((o) => marked.has(o.value) && !o.disabled).map((o) => o.value)

  const set = (next: string[], moved: number, to: string) => {
    const ordered = options.map((o) => o.value).filter((v) => next.includes(v))
    if (value === undefined) setInner(ordered)
    onValueChange?.(ordered)
    setMarked(new Set())
    setAnnounce(t.moved(moved, to))
  }
  const mark = (v: string, on: boolean) => {
    setMarked((prev) => {
      const s = new Set(prev)
      if (on) s.add(v)
      else s.delete(v)
      return s
    })
  }
  const aLabel = availableLabel ?? t.available
  const sLabel = selectedLabel ?? t.selected
  const toAdd = markedIn(available)
  const toRemove = markedIn(selected)
  const movable = (list: TransferOption[]) => list.filter((o) => !o.disabled).map((o) => o.value)

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      data-slot="transfer-list"
      className={cn('flex flex-col items-stretch gap-3 sm:flex-row', className)}
    >
      <TransferPane
        title={aLabel}
        items={available}
        marked={marked}
        onMark={mark}
        filterLabel={t.filter}
        disabled={disabled}
      />
      <div className="flex flex-row items-center justify-center gap-1.5 sm:flex-col">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t.add(toAdd.length)}
          disabled={(disabled ?? false) || toAdd.length === 0}
          onClick={() => {
            set([...chosen, ...toAdd], toAdd.length, sLabel)
          }}
        >
          <ChevronRightIcon className="max-sm:rotate-90" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.addAll}
          disabled={(disabled ?? false) || movable(available).length === 0}
          onClick={() => {
            const all = movable(available)
            set([...chosen, ...all], all.length, sLabel)
          }}
        >
          <ChevronsRightIcon className="max-sm:rotate-90" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.removeAll}
          disabled={(disabled ?? false) || movable(selected).length === 0}
          onClick={() => {
            const all = movable(selected)
            set(
              chosen.filter((v) => !all.includes(v)),
              all.length,
              aLabel,
            )
          }}
        >
          <ChevronsLeftIcon className="max-sm:rotate-90" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t.remove(toRemove.length)}
          disabled={(disabled ?? false) || toRemove.length === 0}
          onClick={() => {
            set(
              chosen.filter((v) => !toRemove.includes(v)),
              toRemove.length,
              aLabel,
            )
          }}
        >
          <ChevronLeftIcon className="max-sm:rotate-90" />
        </Button>
      </div>
      <TransferPane
        title={sLabel}
        items={selected}
        marked={marked}
        onMark={mark}
        filterLabel={t.filter}
        disabled={disabled}
      />
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  )
}

export { TransferList, type TransferOption }

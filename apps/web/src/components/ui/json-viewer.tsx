import { ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const isContainer = (value: unknown): value is object => typeof value === 'object' && value !== null

/** A key as it reads in a path: `user.name`, `items[2]`, `["first name"]`. */
function pathOf(parent: string, key: string | number) {
  if (typeof key === 'number') return `${parent}[${String(key)}]`
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return parent ? `${parent}.${key}` : key
  return `${parent}[${JSON.stringify(key)}]`
}

/** The paths of every object and array down to `depth` levels (0: none, Infinity: all). */
function containerPaths(value: unknown, depth: number, path = '', level = 0): string[] {
  if (!isContainer(value) || level >= depth) return []
  const entries: [string | number, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [i, v])
    : Object.entries(value)
  return [
    path,
    ...entries.flatMap(([k, v]) => containerPaths(v, depth, pathOf(path, k), level + 1)),
  ]
}

function Primitive({ value }: { value: unknown }) {
  if (typeof value === 'string')
    return <span className="break-all text-success">{JSON.stringify(value)}</span>
  if (typeof value === 'number' || typeof value === 'bigint')
    return <span className="text-info">{String(value)}</span>
  if (typeof value === 'boolean') return <span className="text-warning">{String(value)}</span>
  if (value === null) return <span className="text-muted-foreground italic">null</span>
  // undefined, functions, symbols: not JSON, shown as they are.
  return (
    <span className="text-muted-foreground italic">
      {value === undefined ? 'undefined' : `[${typeof value}]`}
    </span>
  )
}

function JsonViewer({
  value,
  defaultExpandDepth = 1,
  rootLabel,
  sortKeys = false,
  copyable = true,
  maxHeight,
  className,
  'aria-label': ariaLabel,
}: {
  /** The parsed JSON (an object, an array or a value). Parse a string with JSON.parse first. */
  value: unknown
  /** Levels open at first: 0 shows the root folded, Infinity opens everything. Default 1. */
  defaultExpandDepth?: number
  /** Shown in the header: "response.json", "payload". */
  rootLabel?: React.ReactNode
  /** Object keys in alphabetical order rather than as given. */
  sortKeys?: boolean
  copyable?: boolean
  /** Beyond this height (a CSS length), the content scrolls. */
  maxHeight?: string
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.display.json
  const [open, setOpen] = React.useState<ReadonlySet<string>>(
    () => new Set(containerPaths(value, defaultExpandDepth)),
  )
  const text = React.useMemo(() => {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }, [value])

  const toggle = (path: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const renderEntry = (
    key: React.ReactNode,
    val: unknown,
    path: string,
    last: boolean,
  ): React.ReactNode => {
    const comma = last ? null : <span className="text-muted-foreground">,</span>
    const keyNode =
      key === null ? null : (
        <>
          <span className="text-foreground">{key}</span>
          <span className="text-muted-foreground">:{'\u00a0'}</span>
        </>
      )
    if (!isContainer(val))
      return (
        <div className="pl-[18px]" data-path={path}>
          {keyNode}
          <Primitive value={val} />
          {comma}
        </div>
      )
    const isArray = Array.isArray(val)
    const entries: [string | number, unknown][] = isArray
      ? val.map((v, i) => [i, v])
      : Object.entries(val).sort(sortKeys ? ([a], [b]) => a.localeCompare(b) : () => 0)
    const [opening, closing] = isArray ? ['[', ']'] : ['{', '}']
    const count = isArray ? t.items(entries.length) : t.keys(entries.length)
    const isOpen = open.has(path)
    if (entries.length === 0)
      return (
        <div className="pl-[18px]" data-path={path}>
          {keyNode}
          <span className="text-muted-foreground">
            {opening}
            {closing}
          </span>
          {comma}
        </div>
      )
    return (
      <div data-path={path}>
        <button
          type="button"
          aria-expanded={isOpen}
          className="-ml-0.5 inline-flex cursor-pointer items-center rounded-sm pr-1 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={() => {
            toggle(path)
          }}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'mr-1.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-fast',
              isOpen && 'rotate-90',
            )}
          />
          {keyNode}
          <span className="text-muted-foreground">{opening}</span>
          {isOpen ? null : (
            <>
              <span className="mx-1 rounded-sm bg-secondary px-1 font-sans text-[11.5px] text-muted-foreground">
                {count}
              </span>
              <span className="text-muted-foreground">{closing}</span>
              {comma}
            </>
          )}
        </button>
        {isOpen ? (
          <>
            <div className="ml-[5px] border-l border-border-subtle pl-[13px]">
              {entries.map(([k, v], i) => (
                <React.Fragment key={k}>
                  {renderEntry(
                    isArray ? null : JSON.stringify(k),
                    v,
                    pathOf(path, k),
                    i === entries.length - 1,
                  )}
                </React.Fragment>
              ))}
            </div>
            <div className="pl-[18px]">
              <span className="text-muted-foreground">{closing}</span>
              {comma}
            </div>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div
      data-slot="json-viewer"
      className={cn('min-w-0 overflow-hidden rounded-lg border border-border bg-inset', className)}
    >
      <div className="flex h-10 items-center gap-1 border-b border-border-subtle pr-1.5 pl-4">
        <span className="mr-auto min-w-0 truncate font-mono text-[12px] text-muted-foreground">
          {rootLabel ?? t.label}
        </span>
        {isContainer(value) ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.expandAll}
                  onClick={() => {
                    setOpen(new Set(containerPaths(value, Infinity)))
                  }}
                >
                  <ChevronsUpDownIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t.expandAll}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.collapseAll}
                  onClick={() => {
                    setOpen(new Set())
                  }}
                >
                  <ChevronsDownUpIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t.collapseAll}</TooltipContent>
            </Tooltip>
          </>
        ) : null}
        {copyable ? <CopyButton value={text} label={t.copy} /> : null}
      </div>
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus
        tabIndex={0}
        role="region"
        aria-label={ariaLabel ?? (typeof rootLabel === 'string' ? rootLabel : t.label)}
        className="overflow-auto px-3 py-3 font-mono text-[12.5px] leading-[1.75] outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {renderEntry(null, value, '', true)}
      </div>
    </div>
  )
}

export { containerPaths, type JsonValue, JsonViewer }

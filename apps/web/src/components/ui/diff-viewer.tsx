'use client'

// Coreloom UI — DiffViewer. What changed between two texts, line by line: a config before and after
// an edit, two versions of a prompt, a document a model rewrote. Unified (one column, + and −) or
// split (before on the left, after on the right). Long runs of unchanged lines fold into a button.
// `diffLines` (the line diff behind it) is exported for your own views.
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface DiffLine {
  type: 'equal' | 'add' | 'remove'
  text: string
  /** Line number in the older text (equal and removed lines), from 1. */
  oldLine?: number
  /** Line number in the newer text (equal and added lines), from 1. */
  newLine?: number
}

/** Beyond this many line pairs, the diff stops looking for common lines and shows a full rewrite. */
const MAX_CELLS = 4_000_000

const splitLines = (text: string) => (text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n'))

/**
 * The lines that stayed, went and came between two texts (longest common subsequence, after the
 * common start and end are set aside). Removed lines come before the added lines that replace them.
 */
function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before)
  const b = splitLines(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  const out: DiffLine[] = []
  for (let i = 0; i < start; i++)
    out.push({ type: 'equal', text: a[i] ?? '', oldLine: i + 1, newLine: i + 1 })

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const n = midA.length
  const m = midB.length
  const push = (type: DiffLine['type'], i: number, j: number) => {
    if (type === 'equal')
      out.push({ type, text: midA[i] ?? '', oldLine: start + i + 1, newLine: start + j + 1 })
    else if (type === 'remove') out.push({ type, text: midA[i] ?? '', oldLine: start + i + 1 })
    else out.push({ type, text: midB[j] ?? '', newLine: start + j + 1 })
  }
  if (n * m > MAX_CELLS) {
    for (let i = 0; i < n; i++) push('remove', i, 0)
    for (let j = 0; j < m; j++) push('add', 0, j)
  } else if (n || m) {
    // lcs[i][j]: common lines between midA[i…] and midB[j…], in one flat array.
    const w = m + 1
    const lcs = new Uint32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lcs[i * w + j] =
          midA[i] === midB[j]
            ? (lcs[(i + 1) * w + j + 1] ?? 0) + 1
            : Math.max(lcs[(i + 1) * w + j] ?? 0, lcs[i * w + j + 1] ?? 0)
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        push('equal', i++, j++)
      } else if (j >= m || (i < n && (lcs[(i + 1) * w + j] ?? 0) >= (lcs[i * w + j + 1] ?? 0))) {
        push('remove', i++, j)
      } else {
        push('add', i, j++)
      }
    }
  }

  for (let k = 0; k < a.length - endA; k++)
    out.push({
      type: 'equal',
      text: a[endA + k] ?? '',
      oldLine: endA + k + 1,
      newLine: endB + k + 1,
    })
  return out
}

/** One row of the split view: the line it had on the left, the line it has on the right. */
interface DiffPair {
  left?: DiffLine
  right?: DiffLine
}

/** Lines side by side: unchanged lines face themselves, each run of changes pairs its removed lines
 * with its added ones, in order. */
function pairLines(lines: readonly DiffLine[]): DiffPair[] {
  const out: DiffPair[] = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    if (line.type === 'equal') {
      out.push({ left: line, right: line })
      i++
      continue
    }
    const removed: DiffLine[] = []
    const added: DiffLine[] = []
    while (i < lines.length && lines[i].type !== 'equal') {
      const l = lines[i]
      if (l.type === 'remove') removed.push(l)
      else added.push(l)
      i++
    }
    for (let k = 0; k < Math.max(removed.length, added.length); k++)
      out.push({ left: removed[k], right: added[k] })
  }
  return out
}

/** Entries to draw, with runs of unchanged ones longer than `context` on each side folded. */
function foldRuns<T>(
  entries: readonly T[],
  isEqual: (entry: T, index: number) => boolean,
  context: number,
  expanded: ReadonlySet<number>,
): ({ entry: T; key: number } | { fold: number; count: number })[] {
  const rows: ({ entry: T; key: number } | { fold: number; count: number })[] = []
  for (let i = 0; i < entries.length;) {
    const entry = entries[i]
    if (!isEqual(entry, i)) {
      rows.push({ entry, key: i++ })
      continue
    }
    let end = i
    while (end < entries.length && isEqual(entries[end], end)) end++
    const head = i === 0 ? 0 : context
    const tail = end === entries.length ? 0 : context
    if (end - i > head + tail + 1 && !expanded.has(i)) {
      for (let k = i; k < i + head; k++) rows.push({ entry: entries[k], key: k })
      rows.push({ fold: i, count: end - i - head - tail })
      for (let k = end - tail; k < end; k++) rows.push({ entry: entries[k], key: k })
    } else {
      for (let k = i; k < end; k++) rows.push({ entry: entries[k], key: k })
    }
    i = end
  }
  return rows
}

/** Line numbers: muted on unchanged lines, stronger on the tinted ones so they keep their contrast. */
const gutter = (type: DiffLine['type'] | undefined) =>
  cn(
    'w-[1%] px-2 text-right align-top whitespace-nowrap tabular-nums select-none',
    type === 'equal' || type === undefined ? 'text-muted-foreground' : 'text-fg-secondary',
  )

const tint = (type: DiffLine['type'] | undefined) =>
  cn(type === 'add' && 'bg-success-subtle', type === 'remove' && 'bg-destructive-subtle')

const SIGNS: Record<DiffLine['type'], string> = { add: '+', remove: '−', equal: '' }

function Sign({ type, className }: { type: DiffLine['type'] | undefined; className?: string }) {
  const t = useCoreloomI18n().messages.display.diff
  const changed = type === 'add' || type === 'remove'
  return (
    <td
      className={cn(
        'w-4 text-center align-top select-none',
        className,
        type === 'add' && 'text-success',
        type === 'remove' && 'text-destructive',
      )}
    >
      {/* The sign is drawn for the eye; the words are read out. */}
      <span aria-hidden>{type ? SIGNS[type] : ''}</span>
      {changed ? <span className="sr-only">{type === 'add' ? t.added : t.removed}</span> : null}
    </td>
  )
}

/** A folded run of unchanged lines: a button across the table that unfolds it. */
function FoldRow({ count, span, onExpand }: { count: number; span: number; onExpand: () => void }) {
  const t = useCoreloomI18n().messages.display.diff
  return (
    <tr>
      <td colSpan={span} className="border-y border-border-subtle bg-inset p-0">
        <button
          type="button"
          className="w-full cursor-pointer px-4 py-1 text-left font-sans text-[12.5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
          onClick={onExpand}
        >
          {t.showUnchanged(count)}
        </button>
      </td>
    </tr>
  )
}

/** What the line slots draw: an empty slot (null, false, undefined) takes no room. */
const filled = (node: React.ReactNode) => node !== null && node !== undefined && node !== false

interface LineSlots {
  /** A control at the start of a line, such as a "comment on this line" button. */
  renderLineAction?: (line: DiffLine) => React.ReactNode
  /** Content under a line, across the whole table, such as the comments on it. */
  renderAfterLine?: (line: DiffLine) => React.ReactNode
}

interface RowsProps extends LineSlots {
  lines: readonly DiffLine[]
  context: number
  expanded: ReadonlySet<number>
  onExpand: (key: number) => void
  /** Classes of the cells that hold the text. */
  textCell: string
}

/** The cell that holds a line's action; an empty one keeps the column. */
function ActionCell({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('w-[1%] px-1 align-top whitespace-nowrap', className)}>{children}</td>
}

/** The content a line slot drew, in a row across the table. */
function AfterRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr data-slot="diff-after-line">
      <td colSpan={span} className="border-y border-border-subtle p-0 font-sans whitespace-normal">
        {/* As wide as the visible part of the table and pinned to its left edge: long lines scroll
            sideways, the content under them stays in view. */}
        <div className="sticky left-0 w-[100cqw]">{children}</div>
      </td>
    </tr>
  )
}

function UnifiedRows({
  lines,
  context,
  expanded,
  onExpand,
  textCell,
  renderLineAction,
  renderAfterLine,
}: RowsProps) {
  const afters = renderAfterLine ? lines.map((line) => renderAfterLine(line)) : []
  const span = renderLineAction ? 5 : 4
  // A line with something under it stays in view: it never folds away.
  const isEqual = (line: DiffLine, i: number) => line.type === 'equal' && !filled(afters[i])
  return (
    <tbody>
      {foldRuns(lines, isEqual, context, expanded).map((row) => {
        if ('fold' in row)
          return (
            <FoldRow
              key={`fold-${String(row.fold)}`}
              count={row.count}
              span={span}
              onExpand={() => {
                onExpand(row.fold)
              }}
            />
          )
        const line = row.entry
        const after = afters[row.key]
        return (
          <React.Fragment key={row.key}>
            <tr
              data-change={line.type === 'equal' ? undefined : line.type}
              className={tint(line.type)}
            >
              {renderLineAction ? <ActionCell>{renderLineAction(line)}</ActionCell> : null}
              <td className={gutter(line.type)}>{line.oldLine}</td>
              <td className={gutter(line.type)}>{line.newLine}</td>
              <Sign type={line.type} />
              <td className={textCell}>{line.text || ' '}</td>
            </tr>
            {filled(after) ? <AfterRow span={span}>{after}</AfterRow> : null}
          </React.Fragment>
        )
      })}
    </tbody>
  )
}

/** One side of a split row: number, sign and text, with the side's tint. */
function SplitHalf({
  line,
  number,
  textCell,
  divided,
  action,
}: {
  line: DiffLine | undefined
  number: number | undefined
  textCell: string
  /** The right half: a line between the two sides. */
  divided?: boolean
  /** The action cell, when the viewer has `renderLineAction`. */
  action?: { node: React.ReactNode }
}) {
  const edge = divided && 'border-l border-border-subtle'
  return (
    <>
      {action ? (
        <ActionCell className={cn(tint(line?.type), edge)}>{action.node}</ActionCell>
      ) : null}
      <td className={cn(gutter(line?.type), tint(line?.type), !action && edge)}>{number}</td>
      <Sign type={line?.type === 'equal' ? undefined : line?.type} className={tint(line?.type)} />
      <td className={cn(textCell, tint(line?.type))}>{line ? line.text || ' ' : ''}</td>
    </>
  )
}

/** The lines of a split row that own its slots: a removed line on the left, the right line. */
const pairOwners = ({ left, right }: DiffPair) =>
  [left?.type === 'remove' ? left : undefined, right] as const

function SplitColumns({ action }: { action: boolean }) {
  const half = (
    <>
      {action ? <col className="w-[1%]" /> : null}
      <col className="w-[1%]" />
      <col className="w-4" />
      <col className="w-1/2" />
    </>
  )
  return (
    <colgroup>
      {half}
      {half}
    </colgroup>
  )
}

function SplitRows({
  lines,
  context,
  expanded,
  onExpand,
  textCell,
  beforeLabel,
  afterLabel,
  renderLineAction,
  renderAfterLine,
}: RowsProps & { beforeLabel: React.ReactNode; afterLabel: React.ReactNode }) {
  const pairs = React.useMemo(() => pairLines(lines), [lines])
  const afters = renderAfterLine
    ? pairs.map((pair) => pairOwners(pair).map((line) => (line ? renderAfterLine(line) : null)))
    : []
  const halfSpan = renderLineAction ? 4 : 3
  const isEqual = (pair: DiffPair, i: number) =>
    pair.left?.type === 'equal' && !afters[i]?.some(filled)
  const action = (line: DiffLine | undefined) =>
    renderLineAction ? { node: line ? renderLineAction(line) : null } : undefined
  return (
    <>
      <SplitColumns action={Boolean(renderLineAction)} />
      <thead>
        <tr className="border-b border-border-subtle text-left font-sans text-[12px] text-muted-foreground">
          <th colSpan={halfSpan} scope="colgroup" className="px-2 py-1 font-medium">
            {beforeLabel}
          </th>
          <th
            colSpan={halfSpan}
            scope="colgroup"
            className="border-l border-border-subtle px-2 py-1 font-medium"
          >
            {afterLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        {foldRuns(pairs, isEqual, context, expanded).map((row) => {
          if ('fold' in row)
            return (
              <FoldRow
                key={`fold-${String(row.fold)}`}
                count={row.count}
                span={halfSpan * 2}
                onExpand={() => {
                  onExpand(row.fold)
                }}
              />
            )
          const { left, right } = row.entry
          const [leftOwner, rightOwner] = pairOwners(row.entry)
          const [afterLeft, afterRight] = afters[row.key] ?? []
          return (
            <React.Fragment key={row.key}>
              <tr data-change={left?.type === 'equal' ? undefined : 'change'}>
                <SplitHalf
                  line={left}
                  number={left?.oldLine}
                  textCell={textCell}
                  action={action(leftOwner)}
                />
                <SplitHalf
                  line={right}
                  number={right?.newLine}
                  textCell={textCell}
                  divided
                  action={action(rightOwner)}
                />
              </tr>
              {filled(afterLeft) || filled(afterRight) ? (
                <AfterRow span={halfSpan * 2}>
                  {filled(afterLeft) ? afterLeft : null}
                  {filled(afterRight) ? afterRight : null}
                </AfterRow>
              ) : null}
            </React.Fragment>
          )
        })}
      </tbody>
    </>
  )
}

type DiffViewerProps = {
  /** The older text. */
  before: string
  /** The newer text. */
  after: string
  /** unified: one column with + and − lines; split: before on the left, after on the right. */
  view?: 'unified' | 'split'
  /** Unchanged lines kept around each change; longer runs fold. Default 3. */
  context?: number
  /** Shown at the start of the header: a file name. */
  title?: React.ReactNode
  /** Column headings in the split view. Default "Before" and "After". */
  beforeLabel?: React.ReactNode
  afterLabel?: React.ReactNode
  /** Shown when the texts are the same. */
  emptyText?: React.ReactNode
  /** Long lines wrap instead of scrolling sideways. */
  wrap?: boolean
  /** The header line (title, lines added and removed). Hide it when your own header says it. Default true. */
  showHeader?: boolean
  /**
   * A control at the start of each line, such as a button to comment on it. In the split view,
   * removed lines get it on the left and the other lines on the right.
   */
  renderLineAction?: (line: DiffLine) => React.ReactNode
  /**
   * Content under a line, across the table, such as the comments on it; return null for none. A
   * line with content never folds away.
   */
  renderAfterLine?: (line: DiffLine) => React.ReactNode
} & Omit<React.ComponentProps<'div'>, 'title'>

function DiffHeader({
  title,
  added,
  removed,
}: {
  title: React.ReactNode
  added: number
  removed: number
}) {
  const t = useCoreloomI18n().messages.display.diff
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-2 font-mono text-[12px]">
      {title ? <span className="mr-auto text-foreground">{title}</span> : null}
      <span className="text-success">{t.linesAdded(added)}</span>
      <span className="text-destructive">{t.linesRemoved(removed)}</span>
    </p>
  )
}

/** The texts are the same: the title, if any, and a line that says so. */
function DiffEmpty({ title, emptyText }: { title: React.ReactNode; emptyText: React.ReactNode }) {
  const t = useCoreloomI18n().messages.display.diff
  return (
    <>
      {title ? (
        <p className="m-0 border-b border-border-subtle px-4 py-2 font-mono text-[12px] text-foreground">
          {title}
        </p>
      ) : null}
      <p className="m-0 p-5 text-[13.5px] text-muted-foreground">{emptyText ?? t.noChanges}</p>
    </>
  )
}

function DiffViewer({
  before,
  after,
  view = 'unified',
  context = 3,
  title,
  beforeLabel,
  afterLabel,
  emptyText,
  wrap = false,
  showHeader = true,
  renderLineAction,
  renderAfterLine,
  className,
  ...props
}: DiffViewerProps) {
  const t = useCoreloomI18n().messages.display.diff
  const lines = React.useMemo(() => diffLines(before, after), [before, after])
  const [expanded, setExpanded] = React.useState<ReadonlySet<number>>(() => new Set())
  // Folds are keyed by position, which means something else once the texts or the view change.
  const [shown, setShown] = React.useState({ lines, view })
  if (shown.lines !== lines || shown.view !== view) {
    setShown({ lines, view })
    setExpanded(new Set())
  }
  const added = lines.filter((l) => l.type === 'add').length
  const removed = lines.filter((l) => l.type === 'remove').length

  if (!added && !removed)
    return (
      <div data-slot="diff-viewer" className={cn('min-w-0', className)} {...props}>
        <DiffEmpty title={showHeader ? title : null} emptyText={emptyText} />
      </div>
    )

  const rows: RowsProps = {
    lines,
    context,
    expanded,
    onExpand: (key) => {
      setExpanded((prev) => new Set(prev).add(key))
    },
    textCell: cn(
      // align-top: in the split view a short side would otherwise centre against a long, wrapped one.
      'pr-4 align-top text-foreground',
      wrap ? '[overflow-wrap:anywhere] whitespace-pre-wrap' : 'whitespace-pre',
    ),
    renderLineAction,
    renderAfterLine,
  }
  return (
    <div data-slot="diff-viewer" data-view={view} className={cn('min-w-0', className)} {...props}>
      {showHeader ? <DiffHeader title={title} added={added} removed={removed} /> : null}
      <DiffTable
        rows={rows}
        split={view === 'split'}
        title={title}
        beforeLabel={beforeLabel ?? t.before}
        afterLabel={afterLabel ?? t.after}
      />
    </div>
  )
}

function DiffTable({
  rows,
  split,
  title,
  beforeLabel,
  afterLabel,
}: {
  rows: RowsProps
  split: boolean
  /** Names the box when long lines make it scroll, if it is text. */
  title: React.ReactNode
  beforeLabel: React.ReactNode
  afterLabel: React.ReactNode
}) {
  const t = useCoreloomI18n().messages.display.diff
  const label = typeof title === 'string' && title ? title : t.label
  // Long lines scroll sideways: only then does the box take a tab stop, so the keyboard can scroll it.
  const ref = React.useRef<HTMLDivElement>(null)
  const [overflows, setOverflows] = React.useState(false)
  React.useEffect(() => {
    const box = ref.current
    if (!box) return
    const observer = new ResizeObserver(() => {
      setOverflows(box.scrollWidth > box.clientWidth + 1)
    })
    observer.observe(box)
    if (box.firstElementChild) observer.observe(box.firstElementChild)
    return () => {
      observer.disconnect()
    }
  }, [])
  return (
    // A size container when content goes under lines: that content takes the visible width.
    <div
      ref={ref}
      role={overflows ? 'group' : undefined}
      aria-label={overflows ? label : undefined}
      tabIndex={overflows ? 0 : undefined}
      className={cn(
        'relative overflow-x-auto outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring',
        rows.renderAfterLine && '@container',
      )}
    >
      <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.7]">
        {split ? (
          <SplitRows {...rows} beforeLabel={beforeLabel} afterLabel={afterLabel} />
        ) : (
          <UnifiedRows {...rows} />
        )}
      </table>
    </div>
  )
}

export { type DiffLine, diffLines, type DiffPair, DiffViewer, pairLines }

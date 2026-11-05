import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface TreeViewNode {
  id: string
  label: string
  /** Before the label. A function gets whether the branch is open (a folder, then an open folder). */
  icon?: React.ReactNode | ((open: boolean) => React.ReactNode)
  /** At the end of the row: a count, a size, a badge. */
  meta?: React.ReactNode
  children?: TreeViewNode[]
  disabled?: boolean
}

interface FlatTreeViewNode {
  node: TreeViewNode
  level: number
  parent?: string
}

function flatten(nodes: TreeViewNode[], level = 1, parent?: string): FlatTreeViewNode[] {
  return nodes.flatMap((node) => [
    { node, level, parent },
    ...flatten(node.children ?? [], level + 1, node.id),
  ])
}

/** The ids of every branch (a node with children): pass them as `defaultExpanded` to open all. */
function branchIds(nodes: TreeViewNode[]): string[] {
  return flatten(nodes)
    .filter((f) => (f.node.children?.length ?? 0) > 0)
    .map((f) => f.node.id)
}

type TreeViewProps = {
  nodes: TreeViewNode[]
  /** Open branches (controlled). */
  expanded?: string[]
  defaultExpanded?: string[]
  onExpandedChange?: (expanded: string[]) => void
  /** Enter, or a click on a row: open a file, go to a page. */
  onAction?: (node: TreeViewNode) => void
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
} & (
  | { selectionMode?: 'none' }
  | {
      selectionMode: 'single'
      selected?: string | null
      defaultSelected?: string | null
      onSelectedChange?: (id: string) => void
    }
  | {
      selectionMode: 'multiple'
      selected?: string[]
      defaultSelected?: string[]
      onSelectedChange?: (ids: string[]) => void
    }
)

function TreeView(props: TreeViewProps) {
  const {
    nodes,
    onAction,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
  } = props
  const t = useCoreloomI18n().messages.display.tree
  const mode = props.selectionMode ?? 'none'
  const flat = React.useMemo(() => flatten(nodes), [nodes])
  const byId = React.useMemo(() => new Map(flat.map((f) => [f.node.id, f])), [flat])

  const [innerExpanded, setInnerExpanded] = React.useState<string[]>(props.defaultExpanded ?? [])
  const expandedList = props.expanded ?? innerExpanded
  const expanded = React.useMemo(() => new Set(expandedList), [expandedList])
  const setExpanded = (next: Set<string>) => {
    const list = flat.map((f) => f.node.id).filter((id) => next.has(id))
    if (props.expanded === undefined) setInnerExpanded(list)
    props.onExpandedChange?.(list)
  }

  const [innerSelected, setInnerSelected] = React.useState<string[]>(() =>
    props.selectionMode === 'multiple'
      ? (props.defaultSelected ?? [])
      : props.selectionMode === 'single' && props.defaultSelected
        ? [props.defaultSelected]
        : [],
  )
  const selected: string[] =
    props.selectionMode === 'multiple'
      ? (props.selected ?? innerSelected)
      : props.selectionMode === 'single'
        ? props.selected === undefined
          ? innerSelected
          : props.selected
            ? [props.selected]
            : []
        : []

  const select = (id: string) => {
    if (byId.get(id)?.node.disabled) return
    if (props.selectionMode === 'multiple') {
      const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]
      const ordered = flat.map((f) => f.node.id).filter((v) => next.includes(v))
      if (props.selected === undefined) setInnerSelected(ordered)
      props.onSelectedChange?.(ordered)
    } else if (props.selectionMode === 'single') {
      if (props.selected === undefined) setInnerSelected([id])
      props.onSelectedChange?.(id)
    }
  }

  const ancestorsOf = (id: string) => {
    const out: string[] = []
    let parent = byId.get(id)?.parent
    while (parent) {
      out.push(parent)
      parent = byId.get(parent)?.parent
    }
    return out
  }
  const visible = flat.filter((f) => ancestorsOf(f.node.id).every((a) => expanded.has(a)))

  const [active, setActive] = React.useState<string | undefined>()
  // The node that takes Tab: the one last focused if still on screen, else the first selected
  // one on screen, else the first.
  const tabStop =
    (active && visible.some((f) => f.node.id === active) ? active : undefined) ??
    visible.find((f) => selected.includes(f.node.id))?.node.id ??
    visible.at(0)?.node.id
  const treeRef = React.useRef<HTMLUListElement>(null)
  const focusNode = (id: string | undefined) => {
    if (!id) return
    setActive(id)
    requestAnimationFrame(() => {
      treeRef.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus()
    })
  }
  const toggle = (id: string, open?: boolean) => {
    const next = new Set(expanded)
    if (open ?? !next.has(id)) next.add(id)
    else next.delete(id)
    setExpanded(next)
  }
  const activate = (id: string) => {
    const f = byId.get(id)
    if (!f || f.node.disabled) return
    onAction?.(f.node)
  }

  const renderNodes = (list: TreeViewNode[], level: number): React.ReactNode =>
    list.map((node) => {
      const hasChildren = (node.children?.length ?? 0) > 0
      const isOpen = expanded.has(node.id)
      const isSelected = selected.includes(node.id)
      const icon = typeof node.icon === 'function' ? node.icon(isOpen) : node.icon
      return (
        <li
          key={node.id}
          role="treeitem"
          data-id={node.id}
          aria-level={level}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-selected={mode === 'none' ? undefined : isSelected}
          aria-disabled={node.disabled ? true : undefined}
          tabIndex={tabStop === node.id ? 0 : -1}
          className="outline-none focus-visible:[&>div]:ring-[3px] focus-visible:[&>div]:ring-ring"
          onFocus={(e) => {
            if (e.target === e.currentTarget) setActive(node.id)
          }}
        >
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the keyboard is handled on the tree (roving focus). */}
          <div
            data-slot="tree-view-row"
            data-selected={isSelected || undefined}
            className={cn(
              'flex h-8 cursor-pointer items-center gap-1.5 rounded-md pr-2 text-[13.5px] text-foreground hover:bg-accent',
              isSelected &&
                'bg-primary-subtle font-medium text-primary-text hover:bg-primary-subtle',
              node.disabled && 'cursor-not-allowed text-faint-foreground hover:bg-transparent',
            )}
            style={{ paddingLeft: `${String((level - 1) * 16 + 4)}px` }}
            onClick={(e) => {
              e.stopPropagation()
              setActive(node.id)
              if (node.disabled) return
              const onToggle = (e.target as HTMLElement).closest('[data-slot=tree-view-toggle]')
              if (onToggle) {
                toggle(node.id)
                return
              }
              if (mode === 'none' && hasChildren) toggle(node.id)
              select(node.id)
              activate(node.id)
            }}
          >
            <span
              data-slot="tree-view-toggle"
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background',
                !hasChildren && 'invisible',
              )}
            >
              <ChevronRightIcon
                className={cn('size-3.5 transition-transform duration-fast', isOpen && 'rotate-90')}
              />
            </span>
            {mode === 'multiple' ? (
              <span
                aria-hidden
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong',
                  isSelected && 'border-transparent bg-primary text-primary-foreground',
                )}
              >
                {isSelected ? <CheckIcon strokeWidth={3} className="size-3" /> : null}
              </span>
            ) : null}
            {icon ? (
              <span
                aria-hidden
                className={cn(
                  'flex shrink-0 items-center text-muted-foreground [&_svg]:size-4',
                  isSelected && 'text-primary-text',
                )}
              >
                {icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate">{node.label}</span>
            {node.meta ? (
              <span
                className={cn(
                  'shrink-0 font-mono text-[11.5px] text-muted-foreground',
                  isSelected && 'text-fg-secondary',
                )}
              >
                {node.meta}
              </span>
            ) : null}
          </div>
          {hasChildren && isOpen ? (
            <ul role="group" className="m-0 list-none p-0">
              {renderNodes(node.children ?? [], level + 1)}
            </ul>
          ) : null}
        </li>
      )
    })

  return (
    <ul
      ref={treeRef}
      role="tree"
      data-slot="tree-view"
      aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : t.label)}
      aria-labelledby={ariaLabelledBy}
      aria-multiselectable={mode === 'multiple' || undefined}
      className={cn('m-0 flex list-none flex-col p-0', className)}
      onKeyDown={(e) => {
        const index = visible.findIndex((f) => f.node.id === tabStop)
        const current = index < 0 ? undefined : visible.at(index)
        if (!current) return
        const id = current.node.id
        const hasChildren = (current.node.children?.length ?? 0) > 0
        const keys: Partial<Record<string, () => void>> = {
          ArrowDown: () => {
            focusNode(visible[index + 1]?.node.id)
          },
          ArrowUp: () => {
            focusNode(index > 0 ? visible[index - 1]?.node.id : undefined)
          },
          Home: () => {
            focusNode(visible.at(0)?.node.id)
          },
          End: () => {
            focusNode(visible.at(-1)?.node.id)
          },
          ArrowRight: () => {
            if (!hasChildren) return
            if (!expanded.has(id)) toggle(id, true)
            else focusNode(current.node.children?.[0]?.id)
          },
          ArrowLeft: () => {
            if (hasChildren && expanded.has(id)) toggle(id, false)
            else focusNode(current.parent)
          },
          '*': () => {
            const next = new Set(expanded)
            for (const f of visible)
              if (f.parent === current.parent && (f.node.children?.length ?? 0) > 0)
                next.add(f.node.id)
            setExpanded(next)
          },
          Enter: () => {
            if (mode === 'single') select(id)
            else if (mode === 'none' && hasChildren && !onAction) toggle(id)
            activate(id)
          },
          ' ': () => {
            if (mode === 'none') {
              if (hasChildren) toggle(id)
            } else select(id)
          },
        }
        const action = keys[e.key]
        if (action) {
          e.preventDefault()
          action()
          return
        }
        // Type-ahead: the next node on screen whose label starts with the typed letter.
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const key = e.key.toLocaleLowerCase()
          const order = [...visible.slice(index + 1), ...visible.slice(0, index + 1)]
          const match = order.find((f) => f.node.label.toLocaleLowerCase().startsWith(key))
          if (match) {
            e.preventDefault()
            focusNode(match.node.id)
          }
        }
      }}
    >
      {renderNodes(nodes, 1)}
    </ul>
  )
}

export { branchIds, TreeView, type TreeViewNode }

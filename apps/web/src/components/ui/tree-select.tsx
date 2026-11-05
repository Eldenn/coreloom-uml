import { CheckIcon, ChevronRightIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface TreeNode {
  value: string
  label: string
  children?: TreeNode[]
  disabled?: boolean
}

interface FlatNode {
  node: TreeNode
  level: number
  parent?: string
  /** Labels from the root down to this node ("Engineering / Frontend"). */
  path: string[]
}

/** Every node with its depth, parent and path, in tree order. */
function flattenTree(nodes: TreeNode[], level = 1, parent?: FlatNode): FlatNode[] {
  return nodes.flatMap((node) => {
    const flat: FlatNode = {
      node,
      level,
      parent: parent?.node.value,
      path: [...(parent?.path ?? []), node.label],
    }
    return [flat, ...flattenTree(node.children ?? [], level + 1, flat)]
  })
}

type TreeSelectProps = {
  nodes: TreeNode[]
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  onBlur?: () => void
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
} & (
  | {
      multiple?: false
      value?: string
      defaultValue?: string
      onValueChange?: (value: string) => void
    }
  | {
      multiple: true
      value?: string[]
      defaultValue?: string[]
      onValueChange?: (value: string[]) => void
    }
)

function TreeSelect(props: TreeSelectProps) {
  const {
    nodes,
    placeholder,
    disabled,
    id,
    className,
    onBlur,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
  } = props
  const t = useCoreloomI18n().messages.inputs.tree
  const multiple = props.multiple === true
  const flat = React.useMemo(() => flattenTree(nodes), [nodes])
  const byValue = React.useMemo(() => new Map(flat.map((f) => [f.node.value, f])), [flat])

  const [inner, setInner] = React.useState<string[]>(() =>
    props.multiple === true
      ? (props.defaultValue ?? [])
      : props.defaultValue
        ? [props.defaultValue]
        : [],
  )
  const picked: string[] =
    props.value === undefined
      ? inner
      : Array.isArray(props.value)
        ? props.value
        : props.value
          ? [props.value]
          : []

  const [open, setOpen] = React.useState(false)
  const ancestorsOf = (value: string) => {
    const out: string[] = []
    let parent = byValue.get(value)?.parent
    while (parent) {
      out.push(parent)
      parent = byValue.get(parent)?.parent
    }
    return out
  }
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(picked.flatMap(ancestorsOf)),
  )
  const [active, setActive] = React.useState<string | undefined>(picked[0] ?? nodes[0]?.value)
  const treeRef = React.useRef<HTMLUListElement>(null)

  // Nodes on screen: every node whose ancestors are all open.
  const visible = flat.filter((f) => ancestorsOf(f.node.value).every((a) => expanded.has(a)))

  const focusNode = (value: string | undefined) => {
    if (!value) return
    setActive(value)
    requestAnimationFrame(() => {
      treeRef.current?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)?.focus()
    })
  }

  // Opening focuses the picked node (or the last one focused, or the first); its onFocus makes it
  // the active one.
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const tree = treeRef.current
      const target = picked.at(0) ?? active
      const node = target
        ? tree?.querySelector<HTMLElement>(`[data-value="${CSS.escape(target)}"]`)
        : null
      ;(node ?? tree?.querySelector<HTMLElement>('[role=treeitem]'))?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the popover opens.
  }, [open])

  const toggleOpen = (value: string, next?: boolean) => {
    setExpanded((prev) => {
      const s = new Set(prev)
      if (next ?? !s.has(value)) s.add(value)
      else s.delete(value)
      return s
    })
  }

  const select = (value: string) => {
    if (byValue.get(value)?.node.disabled) return
    if (props.multiple === true) {
      const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]
      const ordered = flat.map((f) => f.node.value).filter((v) => next.includes(v))
      if (props.value === undefined) setInner(ordered)
      props.onValueChange?.(ordered)
    } else {
      if (props.value === undefined) setInner([value])
      props.onValueChange?.(value)
      setOpen(false)
    }
  }

  const label =
    picked.length === 0
      ? (placeholder ?? t.placeholder)
      : picked.length === 1 || !multiple
        ? (byValue.get(picked[0] ?? '')?.path.join(' / ') ?? picked[0])
        : t.selected(picked.length)

  const renderNodes = (list: TreeNode[], level: number): React.ReactNode =>
    list.map((node) => {
      const hasChildren = (node.children?.length ?? 0) > 0
      const isOpen = expanded.has(node.value)
      const isPicked = picked.includes(node.value)
      return (
        <li
          key={node.value}
          role="treeitem"
          data-value={node.value}
          aria-level={level}
          aria-expanded={hasChildren ? isOpen : undefined}
          aria-selected={isPicked}
          aria-disabled={node.disabled ? true : undefined}
          tabIndex={active === node.value ? 0 : -1}
          className="outline-none focus-visible:[&>div]:ring-[3px] focus-visible:[&>div]:ring-ring"
          onFocus={(e) => {
            if (e.target === e.currentTarget) setActive(node.value)
          }}
        >
          {/* The row: clicking the chevron opens the branch, clicking the label picks the node. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the keyboard is handled on the tree (roving focus). */}
          <div
            className={cn(
              'flex h-8 cursor-pointer items-center gap-1 rounded-sm pr-2 text-[13px] text-foreground hover:bg-accent',
              isPicked && 'font-medium text-primary-text',
              node.disabled && 'cursor-not-allowed text-faint-foreground hover:bg-transparent',
            )}
            style={{ paddingLeft: `${String((level - 1) * 16 + 4)}px` }}
            onClick={(e) => {
              e.stopPropagation()
              setActive(node.value)
              if ((e.target as HTMLElement).closest('[data-slot=tree-toggle]'))
                toggleOpen(node.value)
              else select(node.value)
            }}
          >
            <span
              data-slot="tree-toggle"
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
            {multiple && (
              <span
                aria-hidden
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border-strong',
                  isPicked && 'border-transparent bg-primary text-primary-foreground',
                )}
              >
                {isPicked && <CheckIcon strokeWidth={3} className="size-3" />}
              </span>
            )}
            <span className="truncate">{node.label}</span>
            {!multiple && isPicked && (
              <CheckIcon aria-hidden className="ml-auto size-4 text-primary" />
            )}
          </div>
          {hasChildren && isOpen && (
            <ul role="group" className="m-0 list-none p-0">
              {renderNodes(node.children ?? [], level + 1)}
            </ul>
          )}
        </li>
      )
    })

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- aria-controls is added by PopoverTrigger.
          role="combobox"
          aria-haspopup="tree"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          data-slot="tree-select-trigger"
          data-placeholder={picked.length ? undefined : ''}
          className={cn(
            'flex h-[42px] w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-inset px-[13px] text-left font-sans text-[14px] whitespace-nowrap text-foreground transition-[border-color,box-shadow] duration-base ease-out outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle data-[placeholder]:text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-80 w-(--radix-popover-trigger-width) min-w-64 overflow-y-auto p-1"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
        }}
      >
        <ul
          ref={treeRef}
          role="tree"
          aria-label={ariaLabel ?? t.label}
          aria-multiselectable={multiple || undefined}
          className="m-0 list-none p-0"
          onKeyDown={(e) => {
            const index = visible.findIndex((f) => f.node.value === active)
            const current = index < 0 ? undefined : visible.at(index)
            if (!current) return
            const value = current.node.value
            const hasChildren = (current.node.children?.length ?? 0) > 0
            const keys: Partial<Record<string, () => void>> = {
              ArrowDown: () => {
                focusNode(visible[index + 1]?.node.value)
              },
              ArrowUp: () => {
                focusNode(visible[index - 1]?.node.value)
              },
              Home: () => {
                focusNode(visible[0]?.node.value)
              },
              End: () => {
                focusNode(visible.at(-1)?.node.value)
              },
              ArrowRight: () => {
                if (!hasChildren) return
                if (!expanded.has(value)) toggleOpen(value, true)
                else focusNode(current.node.children?.[0]?.value)
              },
              ArrowLeft: () => {
                if (hasChildren && expanded.has(value)) toggleOpen(value, false)
                else focusNode(current.parent)
              },
              Enter: () => {
                select(value)
              },
              ' ': () => {
                select(value)
              },
            }
            const action = keys[e.key]
            if (action) {
              e.preventDefault()
              action()
            }
          }}
        >
          {renderNodes(nodes, 1)}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export { flattenTree, type TreeNode, TreeSelect }

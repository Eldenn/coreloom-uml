'use client'

// Coreloom UI — DataTable. shadcn's data-table recipe (TanStack Table v8) packaged as one
// component: sorting, a text filter, row selection and pagination on top of Table.
// Columns are TanStack `ColumnDef`s; use DataTableColumnHeader for sortable headers.
//
// Two modes. By default it sorts, filters and paginates `data` in the browser. With `server`, your
// API does: `data` is the current page, `server.rowCount` the total, and `server.query` /
// `server.onQueryChange` hold page, page size, sort and search — keep them in the URL's search
// params and refetch when they change.
//
// With `virtual`, every row stays in the browser but only the visible ones are in the DOM: the
// table scrolls inside a fixed height with its header pinned, and there are no pages. For lists
// of thousands of rows; sorting, the filter and selection work the same.
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
} from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** A virtual table: its scrolling box and row size. */
interface DataTableVirtual {
  /** Height of the scrolling box: 480, "60vh"… */
  height: number | string
  /** Estimated row height in px (rows are measured as they render). Default 41, a one-line row. */
  rowHeight?: number
  /** Rows rendered beyond each edge, so fast scrolling doesn't show blanks. Default 10. */
  overscan?: number
  /** Name of the scrolling region for screen readers. Default: the i18n `dataTable.scrollable`. */
  label?: string
}

/** What a server-driven table asks your API for. `page` starts at 1. */
interface DataTableQuery {
  page: number
  pageSize: number
  /** Column id and direction, or undefined for the API's default order. */
  sort?: { id: string; desc: boolean }
  /** The search box's text ("" when empty). */
  search: string
}

interface DataTableServer {
  query: DataTableQuery
  onQueryChange: (query: DataTableQuery) => void
  /** Rows matching the search across all pages. */
  rowCount: number
  /** A request is in flight: the rows dim and the table is marked busy. */
  loading?: boolean
  /** Show the search box (sent as `query.search`). */
  searchable?: boolean
}

function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  toolbar,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50],
  emptyText,
  getRowId,
  onRowSelectionChange,
  server,
  virtual,
  className,
}: {
  columns: ColumnDef<TData, TValue>[]
  /** All rows, or with `server` the current page's. */
  data: TData[]
  /** Column id the text filter searches. Leave out to hide the filter. */
  filterColumn?: string
  filterPlaceholder?: string
  /** Extra controls at the right of the toolbar (filters, a "New" button…). */
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode
  pageSize?: number
  pageSizeOptions?: number[]
  emptyText?: React.ReactNode
  getRowId?: (row: TData, index: number) => string
  onRowSelectionChange?: (rows: TData[]) => void
  /** Sorting, search and pagination happen in your API (see the file's header). */
  server?: DataTableServer
  /** Render only the visible rows of a long client-side table, in a scrolling box (see the file's header). */
  virtual?: DataTableVirtual
  className?: string
}) {
  const t = useCoreloomI18n().messages
  filterPlaceholder ??= t.dataTable.filter
  emptyText ??= t.dataTable.empty
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const serverState = server && {
    sorting: server.query.sort ? [server.query.sort] : [],
    pagination: { pageIndex: server.query.page - 1, pageSize: server.query.pageSize },
  }
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's API is what this component is built on; the compiler skips it.
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { sorting, columnFilters, columnVisibility, rowSelection, ...serverState },
    initialState: { pagination: { pageSize } },
    onSortingChange: server
      ? (updater) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- serverState is set whenever server is.
          const next = typeof updater === 'function' ? updater(serverState!.sorting) : updater
          server.onQueryChange({ ...server.query, sort: next[0], page: 1 })
        }
      : setSorting,
    onPaginationChange: server
      ? (updater) => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- serverState is set whenever server is.
          const next = typeof updater === 'function' ? updater(serverState!.pagination) : updater
          const sizeChanged = next.pageSize !== server.query.pageSize
          server.onQueryChange({
            ...server.query,
            page: sizeChanged ? 1 : next.pageIndex + 1,
            pageSize: next.pageSize,
          })
        }
      : undefined,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    ...(server
      ? {
          manualPagination: true,
          manualSorting: true,
          manualFiltering: true,
          rowCount: server.rowCount,
        }
      : {
          getSortedRowModel: getSortedRowModel(),
          getFilteredRowModel: getFilteredRowModel(),
          ...(virtual ? {} : { getPaginationRowModel: getPaginationRowModel() }),
        }),
  })

  const rows = table.getRowModel().rows
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: virtual && !server ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => virtual?.rowHeight ?? 41,
    overscan: virtual?.overscan ?? 10,
    getItemKey: (index) => rows[index]?.id ?? index,
  })
  const isVirtual = !!virtual && !server
  const items = isVirtual ? virtualizer.getVirtualItems() : []
  const padTop = items[0]?.start ?? 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const visibleCells = table.getVisibleLeafColumns().length

  const renderRow = (row: (typeof rows)[number], index?: number) => (
    <TableRow
      key={row.id}
      data-state={row.getIsSelected() ? 'selected' : undefined}
      // In a virtual table, assistive tech hears "row 512 of 5,001" although only a few rows exist.
      {...(index !== undefined
        ? { 'data-index': index, 'aria-rowindex': index + 2, ref: virtualizer.measureElement }
        : {})}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )

  // A new page from the server starts with nothing selected.
  React.useEffect(() => {
    if (server) setRowSelection({})
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the query's values change, not when the server object is recreated.
  }, [
    server?.query.page,
    server?.query.pageSize,
    server?.query.sort?.id,
    server?.query.sort?.desc,
    server?.query.search,
  ])

  React.useEffect(() => {
    onRowSelectionChange?.(table.getSelectedRowModel().rows.map((r) => r.original))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reports only selection changes; the callback and the table object change every render.
  }, [rowSelection])

  const filter = !server && filterColumn ? table.getColumn(filterColumn) : undefined
  const showSearch = !!filter || !!server?.searchable

  return (
    <div data-slot="data-table" className={cn('flex flex-col gap-3', className)}>
      {(showSearch || toolbar) && (
        <div
          data-slot="data-table-toolbar"
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {filter ? (
            <div className="relative w-full max-w-72">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={(filter.getFilterValue() as string | undefined) ?? ''}
                onChange={(e) => {
                  filter.setFilterValue(e.target.value)
                }}
                placeholder={filterPlaceholder}
                aria-label={filterPlaceholder}
                className="h-9 pl-9"
              />
            </div>
          ) : server?.searchable ? (
            <ServerSearch server={server} placeholder={filterPlaceholder} />
          ) : (
            <span />
          )}
          {toolbar && <div className="flex items-center gap-2">{toolbar(table)}</div>}
        </div>
      )}

      <Table
        aria-busy={server?.loading ? true : undefined}
        aria-rowcount={isVirtual ? rows.length + 1 : undefined}
        className={cn(server?.loading && '[&_tbody]:opacity-60 [&_tbody]:transition-opacity')}
        container={
          isVirtual
            ? {
                ref: scrollRef,
                // A scrolling box must be reachable with the keyboard to scroll it.
                tabIndex: 0,
                role: 'region',
                'aria-label': virtual.label ?? t.dataTable.scrollable,
                style: { height: virtual.height },
                className:
                  'overflow-y-auto overscroll-contain focus-visible:ring-[3px] focus-visible:ring-ring outline-none',
              }
            : undefined
        }
      >
        <TableHeader
          className={cn(isVirtual && 'sticky top-0 z-10 shadow-[0_1px_0_var(--border-subtle)]')}
        >
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} aria-rowindex={isVirtual ? 1 : undefined}>
              {group.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            isVirtual ? (
              <>
                {padTop > 0 && (
                  <tr aria-hidden style={{ height: padTop }}>
                    <td colSpan={visibleCells} />
                  </tr>
                )}
                {items.map((item) => renderRow(rows[item.index], item.index))}
                {padBottom > 0 && (
                  <tr aria-hidden style={{ height: padBottom }}>
                    <td colSpan={visibleCells} />
                  </tr>
                )}
              </>
            ) : (
              rows.map((row) => renderRow(row))
            )
          ) : (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="h-28 text-center text-muted-foreground"
              >
                {server?.loading ? t.dataTable.loading : emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {isVirtual ? (
        <DataTableCount table={table} />
      ) : (
        <DataTablePagination
          table={table}
          total={server?.rowCount}
          pageSizeOptions={[
            ...new Set([...pageSizeOptions, server?.query.pageSize ?? pageSize]),
          ].sort((x, y) => x - y)}
        />
      )}
    </div>
  )
}

/** The search box of a server-driven table: sends the text 300 ms after typing stops. */
function ServerSearch({ server, placeholder }: { server: DataTableServer; placeholder?: string }) {
  const [text, setText] = React.useState(server.query.search)
  const latest = React.useRef(server)
  // eslint-disable-next-line react-hooks/refs -- latest-value ref: the debounced effect below reads the current query without restarting.
  latest.current = server
  // Follow the query when it changes from outside (back button, a link).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the draft text from the query when it changes from outside.
    setText(server.query.search)
  }, [server.query.search])
  React.useEffect(() => {
    if (text === latest.current.query.search) return
    const timer = setTimeout(() => {
      latest.current.onQueryChange({ ...latest.current.query, search: text, page: 1 })
    }, 300)
    return () => {
      clearTimeout(timer)
    }
  }, [text])
  return (
    <div className="relative w-full max-w-72">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pl-9"
      />
    </div>
  )
}

/** Sortable column header: click cycles ascending → descending → off. */
function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  const t = useCoreloomI18n().messages
  if (!column.getCanSort()) return <span className={className}>{title}</span>
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ArrowUpDownIcon
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      aria-label={t.dataTable.sortBy(title)}
      className={cn(
        '-mx-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 uppercase outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring',
        sorted && 'text-foreground',
        className,
      )}
    >
      {title}
      <Icon className={cn('size-3.5', !sorted && 'text-muted-foreground')} />
    </button>
  )
}

/** "5,000 rows" / "3 of 5,000 selected", for tables without pages. */
function DataTableCount<TData>({ table }: { table: TanstackTable<TData> }) {
  const { messages: t, formatNumber } = useCoreloomI18n()
  const selected = table.getFilteredSelectedRowModel().rows.length
  const total = table.getFilteredRowModel().rows.length
  return (
    <div
      data-slot="data-table-count"
      aria-live="polite"
      className="font-mono text-[12px] text-muted-foreground"
    >
      {selected > 0
        ? t.dataTable.selected(formatNumber(selected), formatNumber(total), selected)
        : t.dataTable.rows(formatNumber(total), total)}
    </div>
  )
}

function DataTablePagination<TData>({
  table,
  total: totalRows,
  pageSizeOptions = [10, 20, 50],
}: {
  table: TanstackTable<TData>
  /** Row count when the rows aren't all in the browser (server-driven tables). */
  total?: number
  pageSizeOptions?: number[]
}) {
  const { messages: t, formatNumber } = useCoreloomI18n()
  const selected = table.getFilteredSelectedRowModel().rows.length
  const total = totalRows ?? table.getFilteredRowModel().rows.length
  const { pageIndex, pageSize } = table.getState().pagination
  return (
    <div
      data-slot="data-table-pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground"
    >
      <span className="font-mono text-[12px]">
        {selected > 0
          ? t.dataTable.selected(formatNumber(selected), formatNumber(total), selected)
          : t.dataTable.rows(formatNumber(total), total)}
      </span>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span>{t.dataTable.rowsPerPage}</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              table.setPageSize(Number(v))
            }}
          >
            <SelectTrigger size="sm" className="w-[72px]" aria-label={t.dataTable.rowsPerPage}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="font-mono text-[12px]">
          {t.dataTable.pageOf(
            formatNumber(pageIndex + 1),
            formatNumber(Math.max(table.getPageCount(), 1)),
          )}
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => {
              table.previousPage()
            }}
            disabled={!table.getCanPreviousPage()}
            aria-label={t.dataTable.previousPage}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => {
              table.nextPage()
            }}
            disabled={!table.getCanNextPage()}
            aria-label={t.dataTable.nextPage}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

export {
  DataTable,
  DataTableColumnHeader,
  DataTableCount,
  DataTablePagination,
  type DataTableQuery,
  type DataTableServer,
  type DataTableVirtual,
}

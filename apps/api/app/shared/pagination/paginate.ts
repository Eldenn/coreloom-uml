/**
 * List-endpoint pagination convention.
 *
 * `paginate(query, params, serialize)` runs Lucid's offset paginator and maps
 * its output to a stable `{ data, meta }` shape so controllers never leak
 * Lucid's own `meta` naming to the wire. Every list endpoint uses this.
 */

/** Page size used when the client does not ask for one. */
export const PAGINATION_DEFAULT_PER_PAGE = 20

/** Hard cap on page size — larger requests are clamped down to this. */
export const PAGINATION_MAX_PER_PAGE = 100

export type PaginationParams = {
  page?: number
  perPage?: number
}

export type PageMeta = {
  page: number
  perPage: number
  total: number
  lastPage: number
}

export type Paginated<T> = {
  data: T[]
  meta: PageMeta
}

/**
 * Structural slice of Lucid's paginator — keeps this helper decoupled from the
 * ORM types. `Architecture.query().where(...)` satisfies it.
 */
type Paginable<Row> = {
  paginate(
    page: number,
    perPage: number,
  ): Promise<{
    all(): Row[]
    readonly currentPage: number
    readonly perPage: number
    readonly total: number
    readonly lastPage: number
  }>
}

export async function paginate<Row, Out>(
  query: Paginable<Row>,
  params: PaginationParams,
  serialize: (row: Row) => Out,
): Promise<Paginated<Out>> {
  const page = Math.max(params.page ?? 1, 1)
  const perPage = Math.min(
    Math.max(params.perPage ?? PAGINATION_DEFAULT_PER_PAGE, 1),
    PAGINATION_MAX_PER_PAGE,
  )

  const result = await query.paginate(page, perPage)

  return {
    data: result.all().map(serialize),
    meta: {
      page: result.currentPage,
      perPage: result.perPage,
      total: result.total,
      lastPage: result.lastPage,
    },
  }
}

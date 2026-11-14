import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of a project, with how many artifacts of each kind it holds. */
export type ProjectOutput = {
  id: number
  name: string
  description: string | null
  architectureCount: number
  /** 0 or 1: a project has at most one agent configuration. */
  agentConfigCount: number
  /** At most `CODE_MAP_LIMITS.perProject`: older maps are dropped. */
  codeMapCount: number
  createdAt: string
  updatedAt: string
}

/** Shape returned by `GET /projects`. */
export type ProjectsListOutput = Paginated<ProjectOutput>

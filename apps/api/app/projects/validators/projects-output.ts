import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of a project, with how many artifacts of each kind it holds. */
export type ProjectOutput = {
  id: number
  name: string
  description: string | null
  architectureCount: number
  createdAt: string
  updatedAt: string
}

/** Shape returned by `GET /projects`. */
export type ProjectsListOutput = Paginated<ProjectOutput>

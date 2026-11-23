import type {
  RequirementCategory,
  RequirementPriority,
} from '#app/requirements/constants/requirement'
import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of a requirement. */
export type RequirementOutput = {
  id: number
  projectId: number
  category: RequirementCategory
  priority: RequirementPriority
  statement: string
  measure: string | null
  createdAt: string
  updatedAt: string
}

/** Shape returned by `GET /projects/:id/requirements`. */
export type RequirementsListOutput = Paginated<RequirementOutput>

import vine from '@vinejs/vine'
import { SKILL_SOURCE_LIMITS } from '#app/skills/constants/skill'

/** A GitHub login: letters, digits and hyphens. */
const OWNER = /^[A-Za-z0-9-]{1,39}$/
/** A repository name, never `.` or `..`. */
const REPO = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/
/** A relative folder: plain segments, none `.` or `..`; leading and trailing `/` are dropped. */
const FOLDER = /^(?!(?:.*\/)?\.{1,2}(?:\/|$))\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?$/

/** `POST /admin/skill-sources`: a GitHub repository to trust, optionally one folder of it. */
export const createSkillSourceInput = vine.create(
  vine.object({
    owner: vine.string().trim().regex(OWNER),
    repo: vine.string().trim().regex(REPO),
    path: vine
      .string()
      .trim()
      .maxLength(SKILL_SOURCE_LIMITS.pathMaxLength)
      .regex(FOLDER)
      .transform((path) => path.replace(/^\/+|\/+$/g, ''))
      .optional(),
  }),
)

/** `PATCH /admin/skill-sources/:id`: read it at the next run, or not. */
export const updateSkillSourceInput = vine.create(
  vine.object({
    enabled: vine.boolean(),
  }),
)

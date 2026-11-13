import { z } from 'zod'
import { FOLDER_PATH } from '../render/architecture-boundaries.ts'

/** What a role may let its agent do. A tool enforces some of them; the others stay instructions. */
export const Right = {
  Read: 'read',
  Write: 'write',
  RunChecks: 'run-checks',
  Shell: 'shell',
  Commit: 'commit',
  Push: 'push',
  Network: 'network',
} as const

export type Right = (typeof Right)[keyof typeof Right]

/** Every right, in render order. */
export const RIGHTS: readonly Right[] = [
  Right.Read,
  Right.Write,
  Right.RunChecks,
  Right.Shell,
  Right.Commit,
  Right.Push,
  Right.Network,
]

/**
 * What a tool does with a right: `granted` when the role has it, `enforced` when the tool itself
 * refuses it, `instruction` when only the role's text asks the agent not to use it.
 */
export const RightStatus = {
  Granted: 'granted',
  Enforced: 'enforced',
  Instruction: 'instruction',
} as const

export type RightStatus = (typeof RightStatus)[keyof typeof RightStatus]

export const ROLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const ROLE_SLUG_MAX_LENGTH = 64
export const ROLE_NAME_MAX_LENGTH = 100
export const ROLE_DESCRIPTION_MAX_LENGTH = 600
export const ROLE_MISSION_MAX_LENGTH = 40_000
/** One line of `forbidden` or `done.commands`, `done.text`, `escalation`. */
export const ROLE_LINE_MAX_LENGTH = 300
/** Longest `forbidden`, `scope` and `done.commands`. */
export const ROLE_LIST_MAX = 30

/** A role frames one coding agent: its mission, what it may do, where, and when it is done. */
export type Role = {
  slug: string
  name: string
  description: string
  mission: string
  /** Without duplicate, in the order of `RIGHTS`. */
  rights: Right[]
  /** Folders from the repository root; none means the whole repository. */
  scope: string[]
  forbidden: string[]
  done: { commands: string[]; text: string | null }
  escalation: string | null
  /** The ready-made role it was copied from, and the agency-agents commit it was copied at. */
  source: { preset: string; commit: string } | null
}

const slug = z.string().max(ROLE_SLUG_MAX_LENGTH).regex(ROLE_SLUG)

const oneLine = z
  .string()
  .refine((text) => text.trim() !== '', { message: 'A line cannot be blank' })
  .refine((text) => !/[\r\n]/.test(text), { message: 'One line only' })

const line = oneLine.max(ROLE_LINE_MAX_LENGTH)

const folder = z
  .string()
  .regex(FOLDER_PATH)
  .refine((path) => !path.split('/').some((part) => part === '.' || part === '..'), {
    message: 'A folder cannot hold `.` or `..`',
  })

/** A right that only makes sense together with another one. */
const REQUIRED_BY: readonly (readonly [Right, Right])[] = [
  [Right.Write, Right.Read],
  [Right.Shell, Right.RunChecks],
  // Committing is a command.
  [Right.Commit, Right.RunChecks],
  [Right.Push, Right.Commit],
]

export const roleSchema: z.ZodType<Role> = z
  .object({
    slug,
    name: oneLine.max(ROLE_NAME_MAX_LENGTH),
    description: oneLine.max(ROLE_DESCRIPTION_MAX_LENGTH),
    mission: z
      .string()
      .max(ROLE_MISSION_MAX_LENGTH)
      .refine((text) => text.trim() !== '', { message: 'A mission cannot be blank' }),
    rights: z.array(z.enum(Right)),
    scope: z.array(folder).max(ROLE_LIST_MAX),
    forbidden: z.array(line).max(ROLE_LIST_MAX),
    done: z.object({ commands: z.array(line).max(ROLE_LIST_MAX), text: line.nullable() }).strict(),
    escalation: line.nullable(),
    source: z
      .object({ preset: slug, commit: z.string().regex(/^[0-9a-f]{40}$/) })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((role, ctx) => {
    const rights = new Set(role.rights)
    if (rights.size !== role.rights.length) {
      ctx.addIssue({ code: 'custom', path: ['rights'], message: 'A right is listed twice' })
    }
    if (!rights.has(Right.Read)) {
      ctx.addIssue({ code: 'custom', path: ['rights'], message: 'Every role can read' })
    }
    for (const [right, needed] of REQUIRED_BY) {
      if (rights.has(right) && !rights.has(needed)) {
        ctx.addIssue({ code: 'custom', path: ['rights'], message: `${right} needs ${needed}` })
      }
    }
  })
  .transform((role) => ({ ...role, rights: RIGHTS.filter((right) => role.rights.includes(right)) }))

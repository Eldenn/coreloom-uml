import { RIGHTS, type Right, RightStatus, type Role } from './role.ts'

/** The rights a role lacks, in the order of `RIGHTS`. */
export function deniedRights(role: Role): Right[] {
  return RIGHTS.filter((right) => !role.rights.includes(right))
}

/**
 * What becomes of each right when a tool runs the role: `enforced` are the rights that tool
 * refuses by itself. A right the role has is granted whatever `enforced` says.
 */
export function roleMatrix(role: Role, enforced: readonly Right[]): Record<Right, RightStatus> {
  const status = (right: Right): RightStatus => {
    if (role.rights.includes(right)) return RightStatus.Granted
    return enforced.includes(right) ? RightStatus.Enforced : RightStatus.Instruction
  }

  return Object.fromEntries(RIGHTS.map((right) => [right, status(right)])) as Record<
    Right,
    RightStatus
  >
}

import { describe, expect, it } from 'vitest'

import { renderRoleBody } from '../render/role.ts'
import { deniedRights, roleMatrix } from '../roles/matrix.ts'
import type { Role } from '../roles/role.ts'
import { generic } from './generic.ts'
import type { RoleContext } from './types.ts'

const reviewer: Role = {
  slug: 'reviewer',
  name: 'Reviewer',
  description: 'Reviews',
  mission: 'Review.',
  rights: ['read', 'run-checks'],
  scope: [],
  forbidden: [],
  done: { commands: ['pnpm test', 'pnpm deploy'], text: null },
  escalation: null,
  source: null,
}

const context: RoleContext = {
  checks: ['pnpm test'],
  otherPackageManagers: [],
  autonomy: null,
  container: false,
}

describe('generic role', () => {
  const render = generic.role?.(reviewer, context)

  it('writes one file under .agents/roles, launched by no command', () => {
    expect(render?.files.map((file) => file.path)).toEqual(['.agents/roles/reviewer.md'])
    expect(render?.launch).toBeNull()
  })

  it('enforces nothing: every refusal is an instruction', () => {
    expect(render?.enforced).toEqual([])
    expect(roleMatrix(reviewer, render?.enforced ?? [])).toEqual({
      read: 'granted',
      write: 'instruction',
      'run-checks': 'granted',
      shell: 'instruction',
      commit: 'instruction',
      push: 'instruction',
      network: 'instruction',
    })
  })

  it('states every refused right and keeps only the checks of the repository', () => {
    const content = render?.files[0]?.content ?? ''

    expect(content).toBe(
      renderRoleBody(reviewer, {
        checks: context.checks,
        instructionRights: deniedRights(reviewer),
      }),
    )
    expect(content.match(/^- You must not .+$/gm)).toHaveLength(5)
    expect(content).toContain('- `pnpm test` passes.')
    expect(content).not.toContain('pnpm deploy')
    expect(content).toBe(content.trim())
  })
})

import { renderRoleBody } from '../render/role.ts'
import { deniedRights } from '../roles/matrix.ts'
import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/** Any tool that follows the AGENTS.md convention: AGENTS.md alone. */
export const generic: TargetTemplate = {
  target: Target.Generic,
  name: 'AGENTS.md',
  verifiedOn: '2026-11-08',
  sources: ['https://agents.md'],
  readsAgentsMd: true,
  recommendations: () => [],
  // The convention has no role file and no way to start a tool as one: nothing is enforced.
  role: (role, context) => ({
    files: [
      {
        path: `.agents/roles/${role.slug}.md`,
        content: renderRoleBody(role, {
          checks: context.checks,
          instructionRights: deniedRights(role),
        }),
      },
    ],
    launch: null,
    enforced: [],
  }),
}

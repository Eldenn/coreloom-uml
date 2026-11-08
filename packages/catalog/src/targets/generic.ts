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
}

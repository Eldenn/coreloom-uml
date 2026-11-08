import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: Cursor picks up AGENTS.md at the project root automatically. Its
 * documentation does not cover nested AGENTS.md files, so none are suggested.
 */
export const cursor: TargetTemplate = {
  target: Target.Cursor,
  name: 'Cursor',
  verifiedOn: '2026-11-08',
  sources: ['https://cursor.com/help/customization/rules'],
  readsAgentsMd: true,
  recommendations: () => [
    {
      title: 'Cursor reads the root AGENTS.md',
      body: 'Cursor loads AGENTS.md from the repository root automatically. Its documentation does not cover AGENTS.md files in subfolders, so keep folder-specific conventions in the root file.',
    },
  ],
}

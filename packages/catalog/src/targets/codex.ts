import { Target } from '../targets.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: Codex reads AGENTS.md natively, from the project root down to the
 * working directory (one file per directory, `AGENTS.override.md` first, 32 KiB in total by
 * default). No pointer needed.
 */
export const codex: TargetTemplate = {
  target: Target.Codex,
  name: 'Codex',
  verifiedOn: '2026-11-08',
  sources: ['https://developers.openai.com/codex/guides/agents-md'],
  readsAgentsMd: true,
  recommendations: () => [],
}

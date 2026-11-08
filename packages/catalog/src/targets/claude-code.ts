import { Target } from '../targets.ts'
import type { RecommendationContext, TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: Claude Code reads CLAUDE.md, not AGENTS.md, and CLAUDE.md can import a
 * file with `@path` (relative to the importing file). Its documentation recommends a CLAUDE.md
 * that imports AGENTS.md, which is the pointer emitted here.
 */
export const claudeCode: TargetTemplate = {
  target: Target.ClaudeCode,
  name: 'Claude Code',
  verifiedOn: '2026-11-08',
  sources: ['https://code.claude.com/docs/en/memory'],
  readsAgentsMd: false,
  pointer: { path: 'CLAUDE.md', body: '@AGENTS.md' },
  recommendations: (context) => [
    {
      title: 'Claude Code permissions',
      body: permissionsBody(context),
    },
  ],
}

/** Splits a checks answer such as `pnpm lint && pnpm test` into its commands. */
export function splitCommands(checks: string): string[] {
  return [
    ...new Set(
      checks
        .split(/&&|\|\||[;,\n]/)
        .map((command) => command.replace(/[`"]/g, '').replace(/\s+/g, ' ').trim())
        .filter((command) => command.length > 0 && command.length <= 120),
    ),
  ]
}

function permissionsBody({ checks }: RecommendationContext): string {
  const intro =
    'CLAUDE.md imports AGENTS.md. To let Claude Code run your checks without asking each time, allow them in `.claude/settings.json` under `permissions.allow`'
  const commands = checks ? splitCommands(checks) : []
  if (commands.length === 0) return `${intro}, for example \`"Bash(pnpm lint)"\`.`
  return `${intro}:\n\n${commands.map((command) => `- \`"Bash(${command})"\``).join('\n')}`
}

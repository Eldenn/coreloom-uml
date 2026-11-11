import { Target } from '../targets.ts'
import type { TargetContext, TargetTemplate } from './types.ts'

/**
 * Denied whatever the answers. Bash rules match the command as the model writes it, so they stop
 * the usual form and are not a security boundary (the tool's documentation says so).
 */
const DEFAULT_DENY = [
  'Read(./.env)',
  'Read(./.env.*)',
  'Read(./secrets/**)',
  'Bash(git push *--force*)',
  'Bash(git push -f *)',
  'Bash(git push * -f)',
  'Bash(git push * -f *)',
  'Bash(rm -rf *)',
  'Bash(rm -fr *)',
]

/**
 * Verified 2026-11-11. Instructions: since v2.1.277 Claude Code reads AGENTS.md by itself, but
 * only when no CLAUDE.md exists and not in every session, while a CLAUDE.md that imports it
 * with `@path` works everywhere: the pointer stays.
 *
 * Settings (`.claude/settings.json`, shared project scope): a `permissions.allow` rule without
 * `*` matches one exact command and applies once the folder is trusted; `deny` wins over `allow`
 * from any scope and needs no trust; `Read(./path)` is relative to the current directory. A
 * `Stop` hook takes no matcher, runs with `sh -c` in the current directory, and exit code 2
 * sends its stderr to the model, which keeps working (at most 8 times in a row without a tool
 * call).
 */
export const claudeCode: TargetTemplate = {
  target: Target.ClaudeCode,
  name: 'Claude Code',
  verifiedOn: '2026-11-11',
  sources: [
    'https://code.claude.com/docs/en/memory',
    'https://code.claude.com/docs/en/permissions',
    'https://code.claude.com/docs/en/hooks',
  ],
  readsAgentsMd: false,
  pointer: { path: 'CLAUDE.md', body: '@AGENTS.md' },
  settings: ({ checks, otherPackageManagers }: TargetContext) => ({
    path: '.claude/settings.json',
    content: JSON.stringify(
      {
        permissions: {
          ...(checks.length > 0 && { allow: checks.map((command) => `Bash(${command})`) }),
          deny: [...DEFAULT_DENY, ...otherPackageManagers.map((manager) => `Bash(${manager} *)`)],
        },
        ...(checks.length > 0 && {
          hooks: { Stop: [{ hooks: [{ type: 'command', command: stopCommand(checks) }] }] },
        }),
      },
      null,
      2,
    ),
  }),
  recommendations: ({ checks }) => [
    {
      title: 'Claude Code settings',
      body:
        checks.length > 0
          ? '`.claude/settings.json` denies reading secrets and destructive commands, allows your checks and runs them before Claude Code hands back. The allowed commands apply once you accept the workspace trust dialog.'
          : '`.claude/settings.json` denies reading secrets and destructive commands.',
    },
  ],
}

/** Runs the checks from the project root; a failure goes to the model, which keeps working. */
function stopCommand(checks: string[]): string {
  return `cd "$CLAUDE_PROJECT_DIR" && (${checks.join(' && ')}) >&2 || exit 2`
}

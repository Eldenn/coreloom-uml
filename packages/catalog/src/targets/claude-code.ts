import { oneLine, stripMarkers } from '../render/markdown.ts'
import { renderRoleBody } from '../render/role.ts'
import { deniedRights } from '../roles/matrix.ts'
import type { Right, Role } from '../roles/role.ts'
import { Target } from '../targets.ts'
import { MCP_KEY_ENV, MCP_SERVER_NAME, MCP_SERVER_URL, mcpRecommendation } from './mcp.ts'
import type { RoleContext, RoleRender, TargetContext, TargetTemplate } from './types.ts'

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
 *
 * MCP page read 2026-11-11: `claude mcp add --transport http <name> <url> --header "…"`, kept
 * in the local scope (outside the repository) unless `--scope project` is passed.
 *
 * Container and network pages read 2026-11-12: a pinned version is installed with
 * `npm install -g @anthropic-ai/claude-code@X.Y.Z` and `DISABLE_AUTOUPDATER=1`;
 * `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` stops telemetry, error reports and feature-flag
 * fetches (Remote Control stops working with it). Requests go to `api.anthropic.com`; the token
 * exchange and refresh of a sign-in go to `platform.claude.com`. `--dangerously-skip-permissions`
 * is refused as root, and a container does not stop a session from sending out what it can read,
 * the credentials in `~/.claude` included.
 *
 * Roles. Subagents, permissions, permission modes and CLI reference pages read 2026-11-12. A
 * project agent is `.claude/agents/<name>.md`; `name` and `description` are required; `tools` is
 * an allowlist of bare tool names ("Tools the subagent can use, as a comma-separated string such
 * as `Read, Grep, Bash` or a YAML list. Inherits every tool available to subagents if omitted");
 * the page's example with `tools: Read, Grep, Glob, Bash` "can't edit files, write files, or use
 * any MCP tools". What `enforced` relies on:
 *
 * (a) Established: `tools` binds the session `claude --agent <name>` starts. "Pass
 *     `--agent <name>` to start a session where the main thread itself takes on that subagent's
 *     tool restrictions and model". Without `Bash` in the list no command runs at all, so every
 *     right the role lacks is refused by the tool.
 * (b) Not established: that `permissionMode: dontAsk` refuses every `Bash` command outside the
 *     `allow` rules. The sentence about `--agent` names "tool restrictions and model", not the
 *     permission mode, and a session takes its mode from "the `--permission-mode` flag, or
 *     `--dangerously-skip-permissions`", then `permissions.defaultMode`, then the built-in
 *     default: the agent's frontmatter is not in that list (the field is documented for an agent
 *     run as a subagent: "When the main conversation is in `default` or `dontAsk` mode, the
 *     subagent runs in the permission mode you set"). And where `dontAsk` does apply, it only
 *     "auto-denies every tool call that would otherwise prompt you": "Claude still runs actions
 *     that need no approval in Manual mode, such as file reads inside your working directories
 *     and read-only Bash commands. Actions matching your `permissions.allow` rules and calls
 *     approved by a PreToolUse hook run too", and those rules may come from the user's own
 *     settings, which the repository does not hold.
 * (c) Established: `--dangerously-skip-permissions` wins over the agent's `permissionMode`. It is
 *     "Equivalent to `--permission-mode bypassPermissions`", the first entry of the list above,
 *     and "When the main conversation is in `bypassPermissions`, `acceptEdits`, or auto mode, the
 *     subagent runs in that same mode and Claude Code ignores the `permissionMode` you set".
 *
 * Since (b) does not hold, a role with `Bash` has nothing enforced, `write` included: a shell
 * command can create or change a file, and the prompt that would stop it is answered by the
 * person, or skipped in the container. `permissionMode: dontAsk` is still written for a role
 * that runs checks without the shell (it holds when the agent runs as a subagent), but no right
 * is called enforced because of it.
 */
export const claudeCode: TargetTemplate = {
  target: Target.ClaudeCode,
  name: 'Claude Code',
  verifiedOn: '2026-11-12',
  sources: [
    'https://code.claude.com/docs/en/memory',
    'https://code.claude.com/docs/en/permissions',
    'https://code.claude.com/docs/en/hooks',
    'https://code.claude.com/docs/en/mcp',
    'https://code.claude.com/docs/en/devcontainer',
    'https://code.claude.com/docs/en/network-config',
    'https://code.claude.com/docs/en/sub-agents',
    'https://code.claude.com/docs/en/permission-modes',
    'https://code.claude.com/docs/en/cli-reference',
  ],
  readsAgentsMd: false,
  pointer: { path: 'CLAUDE.md', body: '@AGENTS.md' },
  sandbox: {
    package: '@anthropic-ai/claude-code',
    version: '2.1.322',
    hosts: ['api.anthropic.com', 'platform.claude.com'],
    env: { DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    credential: 'set `ANTHROPIC_API_KEY`, or run `claude` and sign in',
    unattended: 'claude --dangerously-skip-permissions',
  },
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
  role: renderRole,
  recommendations: ({ checks }) => [
    {
      title: 'Claude Code settings',
      body:
        checks.length > 0
          ? '`.claude/settings.json` denies reading secrets and destructive commands, allows your checks and runs them before Claude Code hands back. The allowed commands apply once you accept the workspace trust dialog.'
          : '`.claude/settings.json` denies reading secrets and destructive commands.',
    },
    mcpRecommendation(
      'Then run, from the repository (the key is kept in your local Claude Code settings, not in the repository):',
      'sh',
      `claude mcp add --transport http ${MCP_SERVER_NAME} ${MCP_SERVER_URL} --header "Authorization: Bearer $${MCP_KEY_ENV}"`,
    ),
  ],
}

/** The agent file a role becomes, and what the session `claude --agent` starts refuses by itself. */
function renderRole(role: Role, { checks, container }: RoleContext): RoleRender {
  const has = (right: Right) => role.rights.includes(right)
  const tools = [
    'Read',
    'Grep',
    'Glob',
    ...(has('write') ? ['Edit', 'Write', 'NotebookEdit'] : []),
    ...(has('run-checks') ? ['Bash'] : []),
    ...(has('network') ? ['WebFetch', 'WebSearch'] : []),
  ]
  // Without `Bash` the tool list leaves no way to do what the role lacks; with it, see (b) above.
  const enforced = has('run-checks') ? [] : deniedRights(role)
  const frontmatter = [
    // A JSON string is a YAML double-quoted scalar: a slug such as `true` or `123` stays a string,
    // and nothing in a description can end the block.
    `name: ${JSON.stringify(role.slug)}`,
    `description: ${JSON.stringify(oneLine(stripMarkers(role.description)))}`,
    `tools: ${tools.join(', ')}`,
    ...(has('run-checks') && !has('shell') ? ['permissionMode: dontAsk'] : []),
  ]
  const body = renderRoleBody(role, {
    checks,
    instructionRights: deniedRights(role).filter((right) => !enforced.includes(right)),
  })

  return {
    files: [
      {
        path: `.claude/agents/${role.slug}.md`,
        content: `---\n${frontmatter.join('\n')}\n---\n\n${body}`,
      },
    ],
    launch: `claude --agent ${role.slug}${container ? ' --dangerously-skip-permissions' : ''}`,
    enforced,
  }
}

/** Runs the checks from the project root; a failure goes to the model, which keeps working. */
function stopCommand(checks: string[]): string {
  return `cd "$CLAUDE_PROJECT_DIR" && (${checks.join(' && ')}) >&2 || exit 2`
}

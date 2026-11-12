import { HASH_MARKERS, wrapManagedBlock } from '../render/managed-block.ts'
import { oneLine, stripMarkers } from '../render/markdown.ts'
import { renderRoleBody } from '../render/role.ts'
import { deniedRights } from '../roles/matrix.ts'
import type { Right, Role } from '../roles/role.ts'
import { Target } from '../targets.ts'
import { PACKAGE_MANAGERS } from './commands.ts'
import { MCP_KEY_ENV, MCP_SERVER_NAME, MCP_SERVER_URL, mcpRecommendation } from './mcp.ts'
import type {
  RoleContext,
  RoleRender,
  TargetContext,
  TargetSettings,
  TargetTemplate,
} from './types.ts'

/** From this `workflow.autonomy` answer up, Codex asks before writing anything. */
const READ_ONLY_FROM = 5

/**
 * Verified 2026-11-11. Instructions: Codex reads AGENTS.md natively, from the project root down
 * to the working directory (one file per directory, `AGENTS.override.md` first, 32 KiB in total
 * by default). No pointer needed.
 *
 * Settings: a trusted project's `.codex/config.toml` overrides the user's. `approval_policy` is
 * `on-request`, `never` or a `granular` table; the reference calls `untrusted` unsupported and
 * `on-failure` deprecated, though Codex 0.167.2 still reads both without an error;
 * `sandbox_mode` is `read-only`, `workspace-write` or `danger-full-access`. Only the first of
 * each is ever written here, and the sandbox comes from the autonomy answer.
 *
 * Rules (experimental): Codex scans `rules/*.rules` next to every active config layer at start;
 * `<repo>/.codex/rules/` loads only when the project's `.codex/` layer is trusted. A file is
 * Starlark: `prefix_rule(pattern, decision, justification, match, not_match)`. `pattern` is an
 * exact prefix of the command's arguments (a list at one position gives alternatives, nothing
 * matches "anywhere after"); the strictest matching decision wins (`forbidden` > `prompt` >
 * `allow`); `allow` runs the command outside the sandbox without asking; `match`/`not_match` are
 * examples Codex checks when it loads the file. A `bash -lc` script made of plain words joined by
 * `&&`, `||`, `;` or `|` is split and each command checked; one with a redirect, a substitution,
 * a variable or a wildcard is checked as a single `bash -lc …` invocation, which no rule here
 * matches. Rules name commands only: reading a file such as `.env` cannot be forbidden.
 *
 * MCP page read 2026-11-11: a `[mcp_servers.<name>]` table in `~/.codex/config.toml` with `url`
 * and `bearer_token_env_var` (`codex mcp add` shows no option for a bearer token).
 *
 * Approvals and authentication pages read 2026-11-12: when a container is the security boundary,
 * Codex is run with full access inside it, so that it does not try to add its own sandbox, which
 * a container may block; a devcontainer does not stop a session from sending out what it can
 * read, Codex credentials included. An API key is piped to `codex login --with-api-key`; a
 * ChatGPT account signs in on a machine without a browser with `codex login --device-auth`
 * (`auth.openai.com`), and its requests go to `chatgpt.com`.
 *
 * Roles. Subagents, advanced configuration, configuration reference, CLI reference, sandboxing,
 * approvals and rules pages read 2026-11-12, and Codex 0.167.2 run offline
 * (`codex debug prompt-input` prints the sandbox in force and the tools the model is given). A
 * project's custom agent is `.codex/agents/<file>.toml`: "Each file defines one custom agent";
 * `name`, `description` and `developer_instructions` are required; "Matching the filename to the
 * agent name is the simplest convention, but the `name` field is the source of truth". The page
 * only shows names with `_`; 0.167.2 offers one named with a hyphen as a role to spawn. Such an
 * agent is a subagent, which the main session starts: no page tells how to start Codex as one,
 * and "Other session settings, including `sandbox_mode`, `approval_policy`, `model_provider`, and
 * `mcp_servers`, don't override the parent configuration when placed in a custom agent file". So
 * the launch command sets the sandbox itself and asks the main session to act as the file.
 *
 * (a) Established: the command line wins over `.codex/config.toml`. "Any `-c key=value`
 *     overrides you pass at the command line take precedence for that invocation"; a profile "is
 *     a layer above your base user config and below project and CLI config"; `--sandbox` is to
 *     "Select the sandbox policy for model-generated shell commands". Run: with
 *     `sandbox_mode = "workspace-write"` in a trusted project's file, `--sandbox read-only` gives
 *     a read-only session, `-c sandbox_workspace_write.network_access=true` an open network, and
 *     `--dangerously-bypass-approvals-and-sandbox` gives `danger-full-access`.
 * (b) Established, and unusable: `-c features.shell_tool=false` removes the command tools of the
 *     main session (`features.shell_tool`: "Enable command execution tools (stable; on by
 *     default)"; `--disable` "translates to `-c features.<name>=false`"). Run: `exec_command` and
 *     `write_stdin` are gone, and what is left (`apply_patch`, `view_image`, the MCP resource
 *     tools, and `spawn_agent` unless `agents.enabled=false`) reads no file. Codex reads with
 *     commands, so a session without them cannot read the repository, nor its own agent file.
 *     Every role can read: the command tools stay, in the file and in the launch command.
 * (c) Established: the sandbox keeps the network off. "By default, the agent runs with network
 *     access turned off"; "the default `workspace-write` sandbox mode keeps network access turned
 *     off unless you enable it in your configuration". Run: a read-only session is told "The
 *     sandbox only permits reading files. Network access is restricted."
 * (d) What keeps every right an instruction: the sandbox does not hold every command. A rule's
 *     `allow` is to "Run the command outside the sandbox without prompting", whatever the sandbox
 *     mode, and matches a prefix, so any argument may follow. The rules file rendered here allows
 *     the project's checks that way, and "When you add a command to the allow list in the TUI,
 *     Codex writes to the user layer at `~/.codex/rules/default.rules`", which the repository
 *     does not hold: a person who once let `git push` through has it run unsandboxed in every
 *     later session. The sandbox also "does not filter web search, app or connector tool calls,
 *     MCP server connections": "Codex defaults to using a web search cache", and setting
 *     `web_search` to `"disabled"` is to "turn the tool off" (0.167.2 accepts
 *     `-c web_search=disabled`), which the launch command does for a role without `network`.
 *     A `forbidden` rule in the project does outrank a user's `allow` (`forbidden` > `prompt` >
 *     `allow`), and still makes no right enforced for a role: rules are loaded for the whole
 *     project, not for one role, so forbidding `git push` would forbid it to the roles that may
 *     push; a prefix is all a rule matches, so `git -C . push` gets through; and `apply_patch`
 *     writes files without any command for a rule to see.
 *
 * So the launch command still picks the narrowest sandbox the rights leave (read-only: "The
 * agent can inspect files, but it can't edit files or run commands without approval"; `.git` is
 * read-only inside a writable workspace), but no right is called enforced because of it.
 */
export const codex: TargetTemplate = {
  target: Target.Codex,
  name: 'Codex',
  verifiedOn: '2026-11-12',
  sources: [
    'https://learn.chatgpt.com/docs/agent-configuration/agents-md',
    'https://learn.chatgpt.com/docs/config-file/config-reference',
    'https://learn.chatgpt.com/docs/agent-configuration/rules',
    'https://developers.openai.com/codex/mcp',
    'https://learn.chatgpt.com/docs/agent-approvals-security',
    'https://learn.chatgpt.com/docs/auth',
    'https://learn.chatgpt.com/docs/agent-configuration/subagents',
    'https://learn.chatgpt.com/docs/config-file/config-advanced',
    'https://learn.chatgpt.com/docs/cli/reference',
    'https://learn.chatgpt.com/docs/sandboxing',
  ],
  readsAgentsMd: true,
  sandbox: {
    package: '@openai/codex',
    version: '0.167.2',
    hosts: ['api.openai.com', 'auth.openai.com', 'chatgpt.com'],
    credential:
      'run `printenv OPENAI_API_KEY | codex login --with-api-key`, or `codex login --device-auth`',
    unattended: 'codex --dangerously-bypass-approvals-and-sandbox',
  },
  settings: (context) => [
    ...(context.autonomy === null
      ? []
      : [
          {
            path: '.codex/config.toml',
            content: wrapManagedBlock(
              `approval_policy = "on-request"\nsandbox_mode = "${readOnly(context) ? 'read-only' : 'workspace-write'}"`,
              HASH_MARKERS,
            ),
          },
        ]),
    rulesFile(context),
  ],
  role: renderRole,
  recommendations: (context) => [
    {
      title: 'Codex project settings',
      body: `Codex loads ${context.autonomy === null ? '' : '`.codex/config.toml` and '}\`${RULES_PATH}\` only in a project you trust, and reads rules when it starts. The rules forbid \`git push --force\`, \`rm -rf\` and the other package managers${
        allowedChecks(context).length > 0
          ? ', and let your checks run outside the sandbox without asking'
          : ''
      }. A rule matches the first words of a command only (\`git push origin main --force\` gets through) and cannot stop a file such as \`.env\` from being read.`,
    },
    mcpRecommendation(
      'Then add to `~/.codex/config.toml`:',
      'toml',
      `[mcp_servers.${MCP_SERVER_NAME}]\nurl = "${MCP_SERVER_URL}"\nbearer_token_env_var = "${MCP_KEY_ENV}"`,
    ),
  ],
}

const RULES_PATH = '.codex/rules/coreloom-uml.rules'

/**
 * A TOML basic string. A JSON string is one, but for the two things JSON lets through and TOML
 * refuses: a raw DEL, and the escape of half a surrogate pair.
 */
const tomlString = (text: string) =>
  // With the `u` flag a surrogate matches only when it stands alone.
  JSON.stringify(text.replace(/\p{Surrogate}/gu, '\ufffd')).replaceAll('\u007f', '\\u007F')

/** The custom agent file a role becomes and the command that starts Codex as it; see (d) above. */
function renderRole(role: Role, { checks, container }: RoleContext): RoleRender {
  const has = (right: Right) => role.rights.includes(right)
  const path = `.codex/agents/${role.slug}.toml`
  const body = renderRoleBody(role, {
    checks,
    instructionRights: deniedRights(role),
    readsWithCommands: true,
  })
  const sandbox = container
    ? '--dangerously-bypass-approvals-and-sandbox'
    : has('write')
      ? `--sandbox workspace-write -c sandbox_workspace_write.network_access=${has('network')}`
      : '--sandbox read-only'

  return {
    files: [
      {
        path,
        content: [
          `name = ${tomlString(role.slug)}`,
          `description = ${tomlString(oneLine(stripMarkers(role.description)))}`,
          `developer_instructions = ${tomlString(body)}`,
        ].join('\n'),
      },
    ],
    // Hosted web search is no command: the sandbox's network setting leaves it on.
    launch: `codex ${sandbox}${has('network') ? '' : ' -c web_search=disabled'} "Act as the agent defined in ${path}."`,
    enforced: [],
  }
}

const readOnly = ({ autonomy }: TargetContext) => autonomy !== null && autonomy >= READ_ONLY_FROM

/**
 * The checks Codex may run without asking. `allow` also takes the command out of the sandbox, so
 * none is allowed when the assistant must ask first.
 */
const allowedChecks = (context: TargetContext) => (readOnly(context) ? [] : context.checks)

type Rule = {
  pattern: (string | string[])[]
  decision: 'forbidden' | 'allow'
  justification: string
  match: string[]
  notMatch?: string[]
}

/**
 * Forbidden whatever the answers: the commands Claude Code is denied, as far as a prefix can say
 * it. A flag placed after other arguments gets through, which `not_match` records.
 */
const DEFAULT_FORBIDDEN: Rule[] = [
  {
    pattern: ['git', 'push', ['--force', '-f']],
    decision: 'forbidden',
    justification: 'Never force-push: add a commit instead of rewriting what was pushed.',
    match: ['git push --force', 'git push -f origin main'],
    notMatch: ['git push origin main', 'git push origin main --force'],
  },
  {
    pattern: ['rm', ['-rf', '-fr']],
    decision: 'forbidden',
    justification: 'Never delete recursively with force: remove the files you mean by name.',
    match: ['rm -rf build', 'rm -fr build'],
    notMatch: ['rm build.log'],
  },
]

/** Words come from fixed lists or from `splitCommands`, which lets no quote or backslash in. */
const list = (items: readonly (string | string[])[]): string =>
  `[${items.map((item) => (typeof item === 'string' ? JSON.stringify(item) : list(item))).join(', ')}]`

function renderRule({ pattern, decision, justification, match, notMatch }: Rule): string {
  return [
    'prefix_rule(',
    `    pattern = ${list(pattern)},`,
    `    decision = "${decision}",`,
    `    justification = ${JSON.stringify(justification)},`,
    `    match = ${list(match)},`,
    ...(notMatch ? [`    not_match = ${list(notMatch)},`] : []),
    ')',
  ].join('\n')
}

function rulesFile(context: TargetContext): TargetSettings {
  const { otherPackageManagers } = context
  const packageManager = PACKAGE_MANAGERS.find((manager) => !otherPackageManagers.includes(manager))
  const rules: Rule[] = [
    ...DEFAULT_FORBIDDEN,
    ...otherPackageManagers.map((manager) => ({
      pattern: [manager],
      decision: 'forbidden' as const,
      justification: `This project uses ${packageManager}, not ${manager}.`,
      match: [`${manager} install`],
    })),
    ...allowedChecks(context).map((command) => ({
      pattern: command.split(' '),
      decision: 'allow' as const,
      justification: 'A check to run before handing work back.',
      match: [command],
    })),
  ]
  return {
    path: RULES_PATH,
    content: wrapManagedBlock(
      [
        '# A rule matches the first words of a command: it stops the usual form, it is not a security boundary.',
        ...rules.map(renderRule),
      ].join('\n\n'),
      HASH_MARKERS,
    ),
  }
}

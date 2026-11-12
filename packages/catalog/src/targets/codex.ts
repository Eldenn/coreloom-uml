import { HASH_MARKERS, wrapManagedBlock } from '../render/managed-block.ts'
import { Target } from '../targets.ts'
import { PACKAGE_MANAGERS } from './commands.ts'
import { MCP_KEY_ENV, MCP_SERVER_NAME, MCP_SERVER_URL, mcpRecommendation } from './mcp.ts'
import type { TargetContext, TargetSettings, TargetTemplate } from './types.ts'

/** From this `workflow.autonomy` answer up, Codex asks before writing anything. */
const READ_ONLY_FROM = 5

/**
 * Verified 2026-11-11. Instructions: Codex reads AGENTS.md natively, from the project root down
 * to the working directory (one file per directory, `AGENTS.override.md` first, 32 KiB in total
 * by default). No pointer needed.
 *
 * Settings: a trusted project's `.codex/config.toml` overrides the user's. `approval_policy` is
 * `on-request`, `never` or a `granular` table; the reference calls `untrusted` unsupported and
 * `on-failure` deprecated, though Codex 0.167.1 still reads both without an error;
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
 */
export const codex: TargetTemplate = {
  target: Target.Codex,
  name: 'Codex',
  verifiedOn: '2026-11-11',
  sources: [
    'https://learn.chatgpt.com/docs/agent-configuration/agents-md',
    'https://learn.chatgpt.com/docs/config-file/config-reference',
    'https://learn.chatgpt.com/docs/agent-configuration/rules',
    'https://developers.openai.com/codex/mcp',
  ],
  readsAgentsMd: true,
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

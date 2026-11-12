import { Target } from '../targets.ts'
import { MCP_KEY_ENV, MCP_SERVER_NAME, MCP_SERVER_URL, mcpRecommendation } from './mcp.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-11. Instructions: Gemini CLI loads GEMINI.md by default; `context.fileName`
 * in its settings can name other files (AGENTS.md included), and GEMINI.md can import a file
 * with `@./path.md`. The pointer is a GEMINI.md that imports AGENTS.md.
 *
 * Settings (`.gemini/settings.json`): `tools.allowed` lists what runs without a confirmation,
 * such as `run_shell_command(npm test)`. Nothing is denied from here: `tools.exclude` is
 * deprecated in favour of the policy engine, whose workspace policies are disabled.
 *
 * MCP page read 2026-11-11: `gemini mcp add --scope user --transport http --header "…" <name> <url>`. The page
 * does not say that settings.json expands variables in `headers`, so the command is suggested,
 * in the user scope: the project's `.gemini/settings.json` is written by the CLI.
 *
 * Authentication and configuration pages read 2026-11-12: without a cached sign-in, a session
 * reads `GEMINI_API_KEY`; `--yolo` approves every action and can only be given on the command
 * line. The pages name no host: `generativelanguage.googleapis.com` is the Gemini API's, and a
 * Google account sign-in needs others, which the firewall does not allow.
 */
export const geminiCli: TargetTemplate = {
  target: Target.GeminiCli,
  name: 'Gemini CLI',
  verifiedOn: '2026-11-11',
  sources: [
    'https://geminicli.com/docs/cli/gemini-md/',
    'https://geminicli.com/docs/reference/configuration/',
    'https://geminicli.com/docs/reference/policy-engine/',
    'https://geminicli.com/docs/tools/mcp-server/',
    'https://geminicli.com/docs/get-started/authentication/',
    'https://ai.google.dev/api',
  ],
  readsAgentsMd: false,
  pointer: { path: 'GEMINI.md', body: '@./AGENTS.md' },
  sandbox: {
    package: '@google/gemini-cli',
    version: '0.68.0',
    hosts: ['generativelanguage.googleapis.com'],
    credential: 'set `GEMINI_API_KEY`',
    unattended: 'gemini --yolo',
  },
  settings: ({ checks }) =>
    checks.length === 0
      ? null
      : {
          path: '.gemini/settings.json',
          content: JSON.stringify(
            { tools: { allowed: checks.map((command) => `run_shell_command(${command})`) } },
            null,
            2,
          ),
        },
  recommendations: () => [
    {
      title: 'Gemini CLI context file',
      body: 'GEMINI.md imports AGENTS.md. Instead, you can set `"context": { "fileName": ["AGENTS.md", "GEMINI.md"] }` in `.gemini/settings.json` and leave GEMINI.md out.',
    },
    mcpRecommendation(
      'Then run (the user scope keeps the key in `~/.gemini/settings.json`, outside the repository):',
      'sh',
      `gemini mcp add --scope user --transport http --header "Authorization: Bearer $${MCP_KEY_ENV}" ${MCP_SERVER_NAME} ${MCP_SERVER_URL}`,
    ),
  ],
}

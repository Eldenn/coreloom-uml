import { Target } from '../targets.ts'
import { MCP_KEY_ENV, MCP_SERVER_URL, mcpRecommendation, mcpServersJson } from './mcp.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: GitHub Copilot reads AGENTS.md as project instructions, as an
 * alternative to `.github/copilot-instructions.md`, and the Copilot agent also finds nested
 * ones. In VS Code's local agent, `chat.useAgentsMdFile` includes the root file and
 * `chat.useNestedAgentsMdFiles` (experimental, off by default) the nested ones. No pointer
 * needed.
 * MCP page (the third source) read 2026-11-11: new Copilot configurations use a top-level
 * `mcpServers` object in `~/.copilot/mcp-config.json` (`$COPILOT_HOME/mcp-config.json` when set),
 * not `.vscode/mcp.json`; `${NAME}` references an environment variable.
 */
export const githubCopilot: TargetTemplate = {
  target: Target.GithubCopilot,
  name: 'GitHub Copilot',
  verifiedOn: '2026-11-08',
  sources: [
    'https://code.visualstudio.com/docs/agent-customization/custom-instructions',
    'https://code.visualstudio.com/docs/agents/reference/custom-instructions-reference',
    'https://code.visualstudio.com/docs/agents/reference/mcp-configuration',
  ],
  readsAgentsMd: true,
  recommendations: () => [
    {
      title: 'GitHub Copilot in VS Code',
      body: 'Copilot reads AGENTS.md as the project instructions. In VS Code, check that the `chat.useAgentsMdFile` setting is on; turn on `chat.useNestedAgentsMdFiles` too if you add AGENTS.md files in subfolders.',
    },
    mcpRecommendation(
      'Then add to `~/.copilot/mcp-config.json` (the key stays in your environment):',
      'json',
      mcpServersJson({
        type: 'http',
        url: MCP_SERVER_URL,
        headers: { Authorization: `Bearer \${${MCP_KEY_ENV}}` },
      }),
    ),
  ],
}

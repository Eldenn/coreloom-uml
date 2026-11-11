import { Target } from '../targets.ts'
import { MCP_KEY_ENV, MCP_SERVER_URL, mcpRecommendation, mcpServersJson } from './mcp.ts'
import type { TargetTemplate } from './types.ts'

/**
 * Verified 2026-11-08: Cursor picks up AGENTS.md at the project root automatically. Its
 * documentation does not cover nested AGENTS.md files, so none are suggested.
 * MCP page read 2026-11-11: `mcpServers` in `.cursor/mcp.json` (project) or `~/.cursor/mcp.json`,
 * a remote server as `url` + `headers`, an environment variable as `${env:NAME}`.
 */
export const cursor: TargetTemplate = {
  target: Target.Cursor,
  name: 'Cursor',
  verifiedOn: '2026-11-08',
  sources: ['https://cursor.com/help/customization/rules', 'https://cursor.com/docs/context/mcp'],
  readsAgentsMd: true,
  recommendations: () => [
    {
      title: 'Cursor reads the root AGENTS.md',
      body: 'Cursor loads AGENTS.md from the repository root automatically. Its documentation does not cover AGENTS.md files in subfolders, so keep folder-specific conventions in the root file.',
    },
    mcpRecommendation(
      'Then add to `.cursor/mcp.json` (the key stays in your environment):',
      'json',
      mcpServersJson({
        url: MCP_SERVER_URL,
        headers: { Authorization: `Bearer \${env:${MCP_KEY_ENV}}` },
      }),
    ),
  ],
}
